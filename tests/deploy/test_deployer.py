"""Offline deployment tests. All Docker/Git/systemd/HTTP operations are mocked."""
import copy
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import tarfile
import unittest
from unittest.mock import Mock, patch

sys.dont_write_bytecode = True
SPEC = importlib.util.spec_from_file_location("iec_deployer", Path(__file__).resolve().parents[2] / "deploy" / "iec-deploy.py")
app = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = app
SPEC.loader.exec_module(app)


def configuration(repo):
    return {"name": "iec-expotrack", "services": {
        "db": {"image": "postgres:17-alpine", "volumes": [{"source": "postgres_data"}], "networks": {"internal": None}},
        "app": {"build": {"context": str(repo)}, "ports": [{"host_ip": "127.0.0.1", "published": "3000", "target": 3000}],
                "cap_drop": ["ALL"], "security_opt": ["no-new-privileges:true"], "networks": {"internal": None, "edge": None}},
        "migrate": {"build": {"context": str(repo)}, "networks": {"internal": None}},
    }, "networks": {"internal": {"internal": True}, "edge": {}}, "volumes": {"postgres_data": {"name": "iec-expotrack_postgres_data"}}}


class SafetyTests(unittest.TestCase):
    def test_branch_names_are_arguments_not_shell_commands(self):
        for value in ["v0.8", "release/v0.8", "feature/tablet-fix"]:
            self.assertEqual(app.valid_branch(value), value)
        for value in ["", "-v", "--upload-pack=x", "v0.8;id", "$(id)", "`id`", "../main", "a//b", "a/.b", "a.lock", "HEAD", "FETCH_HEAD", "v0.8\nmain"]:
            with self.subTest(value=value), self.assertRaises(app.DeployError):
                app.valid_branch(value)

    def test_release_refuses_sensitive_tracked_files(self):
        app.check_tracked_files([".env.example", ".env.production.example", "prisma/migrations/one/migration.sql", "app/page.tsx"])
        for value in [".env", ".env.local", "nested/.env", "backups/db.sql", "outputs/contacts.xlsx", "data/imports/source.xlsx", "a.dump", "private.key", ".next/server.js"]:
            with self.subTest(value=value), self.assertRaises(app.DeployError):
                app.check_tracked_files([value])

    def test_compose_allows_the_current_infrastructure(self):
        current = configuration(Path.cwd())
        app.validate_compose(current, copy.deepcopy(current), Path.cwd())

    def test_compose_refuses_infrastructure_or_security_changes(self):
        current = configuration(Path.cwd())
        mutations = [
            lambda c: c["services"]["db"].update(ports=[{"published": "5432"}]),
            lambda c: c["services"]["db"].update(image="postgres:18"),
            lambda c: c["volumes"].update(postgres_data={"name": "other_database"}),
            lambda c: c["networks"].update(extra={}),
            lambda c: c["services"].update(extra={}),
            lambda c: c["services"]["app"]["ports"][0].update(host_ip="0.0.0.0"),
            lambda c: c["services"]["app"].update(privileged=True),
            lambda c: c["services"]["app"].update(volumes=["/var/run/docker.sock:/var/run/docker.sock"]),
            lambda c: c["services"]["app"].update(security_opt=["no-new-privileges:false"]),
            lambda c: c["services"]["app"].update(user="root"),
            lambda c: c["services"]["app"].update(networks={"edge": None}),
            lambda c: c["services"]["app"]["build"].update(context="/tmp"),
            lambda c: c["services"]["app"]["build"].update(dockerfile="../../Dockerfile"),
            lambda c: c["services"]["migrate"].update(ports=[{"published": "5432"}]),
        ]
        for mutate in mutations:
            candidate = copy.deepcopy(current)
            mutate(candidate)
            with self.subTest(candidate=candidate), self.assertRaises(app.DeployError):
                app.validate_compose(current, candidate, Path.cwd())

    def test_html_parser_collects_only_local_build_assets(self):
        parser = app.AssetParser()
        parser.feed('<script src="/_next/static/chunks/a.js"></script><script src="/theme-init.js"></script>'
                    '<link rel="stylesheet" href="/_next/static/a.css"><script src="https://third-party.example/a.js"></script>'
                    '<link rel="icon" href="/favicon.ico">')
        self.assertEqual(parser.paths, {"/_next/static/chunks/a.js", "/theme-init.js", "/_next/static/a.css"})

    def test_no_shell_or_database_restore_in_worker(self):
        source = Path(app.__file__).read_text(encoding="utf-8")
        self.assertNotIn("shell=True", source)
        self.assertNotIn('"reset"', source)
        self.assertNotIn('"down"', source)
        self.assertNotIn('"prune"', source)
        self.assertIn('"pg_restore", "--list"', source)


class Fixture(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="iec-deploy-test-")
        self.addCleanup(self.temporary.cleanup)
        self.base = Path(self.temporary.name)
        self.repo = self.base / "repo"
        self.repo.mkdir()
        (self.repo / ".env").write_text("", encoding="utf-8")
        self.root = self.base / "jobs"
        self.identifier = "20261018T120000Z-1234abcd"
        self.directory = self.root / self.identifier
        self.directory.mkdir(parents=True)
        self.root.chmod(0o700)
        self.settings = app.Settings(repo=self.repo, root=self.root, executable=self.base / "iec-deploy")
        self.state = {"id": self.identifier, "branch": "v0.8", "status": "queued", "target_commit": "a" * 40,
                      "previous_commit": "b" * 40, "previous_image": "sha256:previous", "database_container": "db-id",
                      "env_checksum": app.file_hash(self.repo / ".env")}
        self.deploy = app.Deployment(self.settings, self.directory, self.state)


class PrivacyTests(Fixture):
    @unittest.skipUnless(os.name == "posix", "Real Linux permission bits required")
    def test_private_umask_keeps_state_private_but_makes_tracked_directories_readable(self):
        archive = self.directory / "private-umask.tar"
        with tarfile.open(archive, "w") as output:
            for name in ["public/", "public/fonts/", "public/fonts/nested/"]:
                member = tarfile.TarInfo(name)
                member.type, member.mode = tarfile.DIRTYPE, 0o700
                output.addfile(member)
            for name, mode in [("public/fonts/nested/font.woff2", 0o600), ("scripts/run.sh", 0o700)]:
                member = tarfile.TarInfo(name)
                member.mode, member.size = mode, 7
                output.addfile(member, io.BytesIO(b"fixture"))
        source = self.directory / "source"
        before = os.umask(0o077)
        try:
            app.extract_source(archive, source)
            private = self.directory / "still-private.json"
            private.write_text("fixture")
        finally:
            os.umask(before)
        self.assertEqual(source.stat().st_mode & 0o777, 0o700)
        self.assertEqual(private.stat().st_mode & 0o777, 0o600)
        for name in ["public", "public/fonts", "public/fonts/nested", "scripts"]:
            self.assertEqual((source / name).stat().st_mode & 0o777, 0o755)
        self.assertEqual((source / "public/fonts/nested/font.woff2").stat().st_mode & 0o777, 0o644)
        self.assertEqual((source / "scripts/run.sh").stat().st_mode & 0o777, 0o755)

    @unittest.skipUnless(os.name == "posix", "Real Linux permission bits required")
    def test_implicit_archive_parent_directories_ignore_private_umask(self):
        archive = self.directory / "implicit.tar"
        with tarfile.open(archive, "w") as output:
            member = tarfile.TarInfo("public/fonts/nested/font.woff2")
            member.size = 1
            output.addfile(member, io.BytesIO(b"x"))
        source = self.directory / "source"
        before = os.umask(0o077)
        try:
            app.extract_source(archive, source)
        finally:
            os.umask(before)
        for name in ["public", "public/fonts", "public/fonts/nested"]:
            self.assertEqual((source / name).stat().st_mode & 0o777, 0o755)

    def test_archive_extraction_excludes_untracked_environment(self):
        archive = self.directory / "source.tar"
        with tarfile.open(archive, "w") as output:
            member = tarfile.TarInfo("app/page.tsx")
            contents = b"export default function Page() {}"
            member.size = len(contents)
            output.addfile(member, io.BytesIO(contents))
        source = self.directory / "source"
        app.extract_source(archive, source)
        self.assertTrue((source / "app/page.tsx").is_file())
        self.assertFalse((source / ".env").exists())
        self.assertTrue((self.repo / ".env").is_file())

    def test_archive_cannot_extract_links_or_parent_paths(self):
        for index, name in enumerate(["../outside", "/outside", "linked"]):
            archive = self.directory / f"bad-{index}.tar"
            with tarfile.open(archive, "w") as output:
                member = tarfile.TarInfo(name)
                if name == "linked":
                    member.type = tarfile.SYMTYPE
                    member.linkname = "/root/.ssh"
                output.addfile(member)
            with self.assertRaises(app.DeployError):
                app.extract_source(archive, self.directory / f"source-{index}")

    def test_log_redacts_known_secrets_and_url_credentials(self):
        log = app.Log(self.directory / "redaction.log")
        log.add_secrets({"AUTH_SECRET": "test-value-with-space", "POSTGRES_PASSWORD": "sample-password", "PUBLIC": "not-sensitive"})
        log.write("test-value-with-space test-value-with-space sample-password https://person:credential@example.com/path")
        text = log.path.read_text(encoding="utf-8")
        for value in ["test-value-with-space", "sample-password", "credential"]:
            self.assertNotIn(value, text)
        self.assertIn("[REDACTED]", text)

    def test_failed_compose_configuration_does_not_print_environment(self):
        runner = app.Runner(self.settings, self.deploy.log)
        with patch.object(app.subprocess, "run", return_value=subprocess.CompletedProcess([], 1, b"private-config", b"private-config")):
            with self.assertRaises(app.DeployError) as caught:
                runner.capture(["docker", "compose", "config", "--format", "json"])
        self.assertNotIn("private-config", str(caught.exception))
        self.assertFalse(self.deploy.log.path.exists())

    def test_invalid_job_path_cannot_escape_state_root(self):
        for value in ["../other", "/root/.ssh", "latest", self.identifier + "/../x"]:
            with self.assertRaises(app.DeployError):
                app.job_directory(self.settings, value)

    def test_schema_fingerprint_ignores_only_dump_noise(self):
        self.deploy.runner = Mock()
        self.deploy.runner.capture.side_effect = [
            "-- dump comment\n\\restrict random1\nCREATE TABLE a ();\n\\unrestrict random1",
            "-- another dump comment\n\\restrict random2\nCREATE TABLE a ();\n\\unrestrict random2",
            "CREATE TABLE changed ();",
        ]
        first = self.deploy.schema_fingerprint()
        self.assertEqual(first, self.deploy.schema_fingerprint())
        self.assertNotEqual(first, self.deploy.schema_fingerprint())


class WorkflowTests(Fixture):
    def setUp(self):
        super().setUp()
        self.deploy.before_migrations = "original-migrations"
        self.deploy.before_schema = "original-schema"
        self.deploy.prepare = Mock(return_value=configuration(self.repo))
        self.deploy.backup = Mock()
        self.deploy.checkout = Mock()
        self.deploy.wait_healthy = Mock()
        self.deploy.verify_local = Mock()
        self.deploy.migrations = Mock(return_value="original-migrations")
        self.deploy.schema_fingerprint = Mock(return_value="original-schema")
        self.deploy.git = Mock(side_effect=lambda *args: self.state["target_commit"] if args == ("rev-parse", "HEAD") else "")
        self.deploy.runner = Mock(spec=app.Runner)
        self.extract = patch.object(app, "extract_source")
        self.extract.start()
        self.addCleanup(self.extract.stop)
        def capture(args, **_kwargs):
            if args[:3] == ["docker", "image", "inspect"]:
                if "migrate" in args[3]:
                    return json.dumps([{"Config": {"Cmd": ["npx", "prisma", "migrate", "deploy"]}}])
                return json.dumps([{"Id": "sha256:new", "Config": {"User": "nextjs", "Labels": {"org.opencontainers.image.revision": self.state["target_commit"]}}}])
            if args[:3] == ["docker", "inspect", "--format"]:
                return "sha256:new"
            return "app-id"
        self.deploy.runner.capture.side_effect = capture
        self.http = patch.object(app, "get_url", return_value=b'{"status":"ok"}')
        self.http.start()
        self.addCleanup(self.http.stop)

    def test_successful_deployment_order_and_app_only_replacement(self):
        calls = Mock()
        for name in ["prepare", "backup", "checkout"]:
            calls.attach_mock(getattr(self.deploy, name), name)
        calls.attach_mock(self.deploy.runner.stream, "stream")
        self.assertEqual(self.deploy.run(), 0)
        self.assertEqual(self.state["status"], "succeeded")
        names = [call[0] for call in calls.mock_calls]
        self.assertEqual(names[:3], ["prepare", "backup", "checkout"])
        commands = [call.args[0] for call in self.deploy.runner.stream.call_args_list]
        self.assertEqual([cmd[-3:] for cmd in commands[:2]], [["build", "app", "migrate"], ["--no-deps", "-T", "migrate"]])
        self.assertIn("--no-deps", commands[2])
        self.assertEqual(commands[2][-1], "app")
        self.assertEqual(json.loads((self.root / "active.json").read_text())["commit"], self.state["target_commit"])

    def test_failed_backup_prevents_checkout_build_and_migration(self):
        self.deploy.backup.side_effect = app.DeployError("backup failed")
        self.assertEqual(self.deploy.run(), 1)
        self.deploy.checkout.assert_not_called()
        self.deploy.runner.stream.assert_not_called()
        self.assertEqual(self.state["status"], "failed")

    def test_failed_build_does_not_replace_running_app(self):
        self.deploy.runner.stream.side_effect = app.DeployError("build failed")
        self.assertEqual(self.deploy.run(), 1)
        self.assertEqual(self.deploy.runner.stream.call_count, 1)
        self.assertFalse(self.deploy.cutover)

    def test_image_permissions_are_checked_before_migrations_or_cutover(self):
        events = []
        self.deploy.runner.stream.side_effect = lambda command, **kwargs: events.append("build" if "build" in command else "migration" if "migrate" in command else "cutover")
        self.deploy.verify_image_files = Mock(side_effect=lambda image: events.append("file-check"))
        self.assertEqual(self.deploy.run(), 0)
        self.assertEqual(events, ["build", "file-check", "migration", "cutover"])
        self.deploy.verify_image_files.assert_called_once_with("sha256:new")

    def test_unreadable_image_leaves_database_and_running_app_untouched(self):
        self.deploy.verify_image_files = Mock(side_effect=app.DeployError("font EACCES"))
        self.assertEqual(self.deploy.run(), 1)
        self.assertEqual(self.state["status"], "failed")
        self.assertEqual(self.deploy.runner.stream.call_count, 1)
        self.assertFalse(self.deploy.cutover)
        self.deploy.migrations.assert_not_called()

    def test_failed_migration_leaves_old_app_running(self):
        self.deploy.runner.stream.side_effect = [None, app.DeployError("migration failed")]
        self.assertEqual(self.deploy.run(), 1)
        self.assertEqual(self.deploy.runner.stream.call_count, 2)
        self.assertFalse(self.deploy.cutover)

    def test_local_failure_rolls_back_only_when_schema_and_migrations_unchanged(self):
        self.deploy.verify_local.side_effect = [app.DeployError("asset missing"), None]
        self.assertEqual(self.deploy.run(), 1)
        self.assertEqual(self.state["status"], "rolled_back")
        rollback = self.deploy.runner.stream.call_args_list[-1].args[0]
        self.assertTrue(any("rollback.override.json" in argument for argument in rollback))
        self.assertEqual(rollback[-1], "app")
        self.assertNotIn("db", rollback)

    def test_migration_changes_block_automatic_app_rollback(self):
        self.deploy.verify_local.side_effect = app.DeployError("asset missing")
        self.deploy.migrations.return_value = "changed-migrations"
        self.assertEqual(self.deploy.run(), 1)
        self.assertEqual(self.state["status"], "needs_attention")
        self.assertEqual(self.deploy.runner.stream.call_count, 3)

    def test_schema_changes_without_migration_record_also_block_rollback(self):
        self.deploy.verify_local.side_effect = app.DeployError("asset missing")
        self.deploy.schema_fingerprint.return_value = "changed-schema"
        self.assertEqual(self.deploy.run(), 1)
        self.assertEqual(self.state["status"], "needs_attention")
        self.assertEqual(self.deploy.runner.stream.call_count, 3)

    def test_unknown_database_state_blocks_rollback(self):
        self.deploy.verify_local.side_effect = app.DeployError("asset missing")
        self.deploy.migrations.side_effect = app.DeployError("database unavailable")
        self.assertEqual(self.deploy.run(), 1)
        self.assertEqual(self.state["status"], "needs_attention")
        self.assertEqual(self.deploy.runner.stream.call_count, 3)

    def test_public_only_failure_keeps_the_verified_local_app(self):
        with patch.object(app, "get_url", side_effect=app.DeployError("public HTTPS failed")):
            self.assertEqual(self.deploy.run(), 1)
        self.assertEqual(self.state["status"], "needs_attention")
        self.assertTrue(self.deploy.local_verified)
        self.assertEqual(self.deploy.runner.stream.call_count, 3)

    def test_environment_change_prevents_migrations_and_cutover(self):
        self.state["env_checksum"] = "different"
        self.assertEqual(self.deploy.run(), 1)
        self.assertEqual(self.deploy.runner.stream.call_count, 1)
        self.assertFalse(self.deploy.cutover)

    def test_rejects_an_image_that_runs_as_root(self):
        self.deploy.runner.capture.return_value = json.dumps([{"Config": {"User": "root"}}])
        self.deploy.runner.capture.side_effect = None
        self.assertEqual(self.deploy.run(), 1)
        self.assertEqual(self.deploy.runner.stream.call_count, 1)


class ImageAndHealthTests(Fixture):
    def test_image_probe_uses_actual_non_root_user_without_secrets_or_network(self):
        self.deploy.runner = Mock(spec=app.Runner)
        self.deploy.runner.capture.return_value = "Non-root runtime file access OK"
        self.deploy.verify_image_files("sha256:candidate")
        command = self.deploy.runner.capture.call_args.args[0]
        self.assertEqual(command[:7], ["docker", "run", "--rm", "--network", "none", "--read-only", "--cap-drop"])
        self.assertIn("no-new-privileges:true", command)
        self.assertEqual(command[-3:], ["sha256:candidate", "-e", app.IMAGE_FILES_CHECK])
        for forbidden in ["--env", "--env-file", "-e", "--mount", "-v", "--user"]:
            self.assertNotIn(forbidden, command[:-2])
        self.assertIn("/app/public", app.IMAGE_FILES_CHECK)
        self.assertIn("process.getuid() === 0", app.IMAGE_FILES_CHECK)

    def test_image_probe_failure_has_safe_actionable_diagnostic(self):
        self.deploy.runner = Mock(spec=app.Runner)
        self.deploy.runner.capture.side_effect = app.DeployError("command failed")
        with self.assertRaisesRegex(app.DeployError, "before migrations or app replacement"):
            self.deploy.verify_image_files("sha256:candidate")

    def test_crashed_or_unhealthy_app_reports_actual_failure_not_timeout(self):
        for state in [{"Status": "restarting", "ExitCode": 1, "OOMKilled": False}, {"Status": "exited", "ExitCode": 1}, {"Status": "running", "Health": {"Status": "unhealthy"}}, {"Status": "restarting", "Health": {"Status": "healthy"}}]:
            self.deploy.runner = Mock(spec=app.Runner)
            self.deploy.runner.capture.side_effect = ["app-id", json.dumps([{"State": state}])]
            with self.subTest(state=state), patch.object(app.time, "sleep") as sleep, self.assertRaisesRegex(app.DeployError, "not a 120-second timeout"):
                self.deploy.wait_healthy()
            sleep.assert_not_called()

    def test_genuinely_starting_app_can_time_out(self):
        self.deploy.runner = Mock(spec=app.Runner)
        self.deploy.runner.capture.side_effect = ["app-id", json.dumps([{"State": {"Status": "running", "Health": {"Status": "starting"}}}])] * 60
        with patch.object(app.time, "sleep") as sleep, self.assertRaisesRegex(app.DeployError, "within 120 seconds"):
            self.deploy.wait_healthy()
        self.assertEqual(sleep.call_count, 60)


class BackupTests(Fixture):
    def test_archive_must_pass_listing_before_checkout_is_possible(self):
        self.deploy.runner = Mock(spec=app.Runner)
        def write_dump(_args, destination):
            destination.write_bytes(b"archive fixture")
        self.deploy.runner.dump.side_effect = write_dump
        self.deploy.backup()
        self.deploy.runner.verify_dump.assert_called_once_with("db-id", self.directory / "database.dump")
        self.assertEqual(self.state["backup_sha256"], hashlib.sha256(b"archive fixture").hexdigest())
        self.assertTrue((self.directory / "rollback.override.json").is_file())

    def test_corrupt_backup_does_not_record_a_verified_backup(self):
        self.deploy.runner = Mock(spec=app.Runner)
        self.deploy.runner.dump.side_effect = lambda _args, destination: destination.write_bytes(b"bad fixture")
        self.deploy.runner.verify_dump.side_effect = app.DeployError("invalid archive")
        with self.assertRaises(app.DeployError):
            self.deploy.backup()
        self.assertNotIn("backup_sha256", self.state)


class PreflightTests(Fixture):
    def setUp(self):
        super().setUp()
        self.config = configuration(self.repo)
        self.sql = b"CREATE TABLE example (id integer);\n"
        self.checksum = hashlib.sha256(self.sql).hexdigest()
        self.deploy.migrations = Mock(return_value=f"one|{self.checksum}|1|0")
        self.deploy.schema_fingerprint = Mock(return_value="schema")
        self.deploy.runner = Mock(spec=app.Runner)
        def capture(command, **_kwargs):
            if command[0] == "git":
                args = command[1:]
                if args == ["rev-parse", "--show-toplevel"]:
                    return str(self.repo)
                if args == ["remote", "get-url", "origin"]:
                    return "git@github.com:Amirmahdidarabian/IEC-ExpoTrack.git"
                if args == ["rev-parse", "HEAD"]:
                    return "b" * 40
                if args[:2] == ["rev-parse", "--verify"]:
                    return "a" * 40
                if args[0] == "show":
                    return "services: {}"
                return ""
            if command[:2] == ["docker", "compose"]:
                if "config" in command:
                    return json.dumps(self.config)
                return "old-app" if command[-1] == "app" else "old-db"
            if command[:2] == ["docker", "inspect"]:
                return json.dumps([{"Config": {"Labels": {"com.docker.compose.project": "iec-expotrack"}, "Env": []},
                                    "State": {"Health": {"Status": "healthy"}}, "Image": "sha256:old"}])
            if command[:2] == ["docker", "info"]:
                return str(self.base)
            return "128"
        self.deploy.runner.capture.side_effect = capture
        self.deploy.runner.capture_bytes.side_effect = lambda command: b"app/page.tsx\0" if "ls-tree" in command else self.sql
        self.space = patch.object(app.shutil, "disk_usage", return_value=Mock(free=4 * 1024**3))
        self.space.start()
        self.addCleanup(self.space.stop)

    def test_preflight_pins_remote_sha_and_preserves_running_image(self):
        self.deploy.prepare()
        self.assertEqual(self.state["target_commit"], "a" * 40)
        self.assertEqual(self.state["previous_image"], "sha256:old")
        self.deploy.runner.dump.assert_not_called()
        self.deploy.runner.stream.assert_not_called()

    def test_applied_migration_checksum_mismatch_blocks_before_backup(self):
        self.deploy.migrations.return_value = "one|different|1|0"
        with self.assertRaises(app.DeployError):
            self.deploy.prepare()
        self.deploy.runner.dump.assert_not_called()

    def test_unfinished_migration_blocks_before_backup(self):
        self.deploy.migrations.return_value = f"one|{self.checksum}|0|0"
        with self.assertRaises(app.DeployError):
            self.deploy.prepare()
        self.deploy.runner.dump.assert_not_called()

    def test_branch_moved_after_menu_confirmation_blocks_before_backup(self):
        self.state["expected_commit"] = "c" * 40
        with self.assertRaisesRegex(app.DeployError, "changed since your preview"):
            self.deploy.prepare()
        self.deploy.runner.dump.assert_not_called()
        self.deploy.runner.stream.assert_not_called()


class HttpTests(unittest.TestCase):
    def response(self, body, mime="application/javascript", length=None):
        response = Mock(status=200, headers={"Content-Type": mime, "Content-Length": str(len(body) if length is None else length)})
        response.read.return_value = body
        context = Mock()
        context.__enter__ = Mock(return_value=response)
        context.__exit__ = Mock(return_value=False)
        return context

    def test_successful_javascript_response_has_correct_mime_and_complete_body(self):
        opener = Mock()
        opener.open.return_value = self.response(b"console.log('ok')")
        with patch.object(app, "build_opener", return_value=opener):
            self.assertEqual(app.get_url("https://example.invalid/a.js", expected_type="javascript"), b"console.log('ok')")

    def test_incomplete_body_or_wrong_mime_is_not_success(self):
        for context in [self.response(b"short", length=100), self.response(b"html", mime="text/html")]:
            opener = Mock()
            opener.open.return_value = context
            with patch.object(app, "build_opener", return_value=opener), self.assertRaises(app.DeployError):
                app.get_url("https://example.invalid/a.js", expected_type="javascript")


class DispatchTests(Fixture):
    def test_log_view_does_not_hang_if_worker_disappears(self):
        app.save_json(self.directory / "state.json", self.state)
        with patch.object(app.subprocess, "run", return_value=subprocess.CompletedProcess([], 0, stdout="inactive\n")), \
             patch("sys.stdout", new_callable=io.StringIO):
            self.assertEqual(app.follow(self.settings, self.directory), 1)

    def test_interrupting_log_view_does_not_cancel_worker(self):
        app.save_json(self.directory / "state.json", self.state)
        with patch.object(app.subprocess, "run", return_value=subprocess.CompletedProcess([], 0, stdout="active\n")) as commands, \
             patch.object(app.time, "sleep", side_effect=KeyboardInterrupt), patch("sys.stdout", new_callable=io.StringIO):
            self.assertEqual(app.follow(self.settings, self.directory), 0)
        self.assertTrue(all("stop" not in call.args[0] for call in commands.call_args_list))
        self.assertEqual(json.loads((self.directory / "state.json").read_text())["status"], "queued")

    def test_deployment_is_detached_under_systemd(self):
        self.settings.executable.write_text("fixture", encoding="utf-8")
        with patch.object(app, "private_dir", side_effect=lambda p: p.mkdir(parents=True, exist_ok=True)), \
             patch.object(app.shutil, "which", return_value="/usr/bin/fixture"), \
             patch.object(app.subprocess, "run", return_value=subprocess.CompletedProcess([], 0)) as run, \
             patch.object(app, "follow", return_value=0):
            self.assertEqual(app.dispatch(self.settings, "release/v0.8"), 0)
        command = run.call_args.args[0]
        self.assertEqual(command[0], "systemd-run")
        self.assertIn("--service-type=exec", command)
        self.assertIn("--property=UMask=0077", command)
        self.assertEqual(command[-2], "__worker")
        self.assertIsNone(run.call_args.kwargs.get("shell"))

    def test_systemd_start_failure_marks_job_failed(self):
        self.settings.executable.write_text("fixture", encoding="utf-8")
        with patch.object(app, "private_dir", side_effect=lambda p: p.mkdir(parents=True, exist_ok=True)), \
             patch.object(app.shutil, "which", return_value="/usr/bin/fixture"), \
             patch.object(app.subprocess, "run", return_value=subprocess.CompletedProcess([], 1)):
            with self.assertRaises(app.DeployError):
                app.dispatch(self.settings, "v0.8")
        states = [json.loads(path.read_text()) for path in self.root.glob("*/state.json")]
        self.assertEqual(states[0]["status"], "failed")

    @unittest.skipUnless(os.name == "posix", "Linux flock integration")
    def test_concurrent_worker_refuses_to_touch_repository(self):
        import fcntl
        app.save_json(self.directory / "state.json", self.state)
        with (self.root / "deploy.lock").open("a") as lock, patch.object(app, "private_dir"), patch.object(app.Deployment, "run") as run:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            self.assertEqual(app.worker(self.settings, self.identifier), 1)
            run.assert_not_called()
        self.assertEqual(json.loads((self.directory / "state.json").read_text())["status"], "failed")


class BrowserTests(Fixture):
    def setUp(self):
        super().setUp()
        self.releases = [{"branch": "v0.8", "commit": "a" * 40, "date": "2026-10-18T12:00:00Z",
                          "author": "Maintainer", "subject": "Improve tablet layout"},
                         {"branch": "v0.7", "commit": "b" * 40, "date": "2026-10-17T12:00:00Z",
                          "author": "Maintainer", "subject": "Previous release"}]
        self.browser = Mock(spec=app.ReleaseBrowser)
        self.browser.branches.return_value = self.releases
        self.browser.live.return_value = {"commit": "b" * 40, "health": "healthy", "checkout": "ccccccc"}

    def invoke(self, answers, **kwargs):
        with patch.object(app, "ReleaseBrowser", return_value=self.browser), \
             patch("builtins.input", side_effect=answers), patch("sys.stdout", new_callable=io.StringIO) as output, \
             patch.object(app, "dispatch", return_value=0) as dispatch:
            result = app.menu(self.settings, **kwargs)
        return result, output.getvalue(), dispatch

    def test_list_only_shows_actual_image_not_checkout_and_never_dispatches(self):
        result, output, dispatch = self.invoke([], list_only=True)
        self.assertEqual(result, 0)
        self.assertIn("v0.7 [RUNNING]", output)
        self.assertIn("ccccccc (not necessarily the running version)", output)
        self.assertIn("Maintainer - Improve tablet layout", output)
        dispatch.assert_not_called()

    def test_number_selection_requires_exact_confirmation_and_pins_preview(self):
        result, _output, dispatch = self.invoke(["1", "deploy v0.8"])
        self.assertEqual(result, 0)
        self.browser.details.assert_called_once_with(self.releases[0])
        dispatch.assert_called_once_with(self.settings, "v0.8", expected_commit="a" * 40)

    def test_direct_branch_still_previews_and_requires_confirmation(self):
        _result, _output, dispatch = self.invoke(["deploy v0.8"], preferred="v0.8")
        dispatch.assert_called_once_with(self.settings, "v0.8", expected_commit="a" * 40)

    def test_cancel_invalid_choice_refresh_and_exit_do_not_deploy(self):
        _result, output, dispatch = self.invoke(["missing", "r", "1", "yes", "q"])
        self.assertIn("Version not found", output)
        self.assertIn("Cancelled", output)
        dispatch.assert_not_called()

    def test_current_image_does_not_trigger_redundant_deployment(self):
        _result, output, dispatch = self.invoke(["2", "q"])
        self.assertIn("already running", output)
        dispatch.assert_not_called()

    def test_legacy_image_is_explicitly_unknown(self):
        self.browser.live.return_value["commit"] = None
        _result, output, _dispatch = self.invoke([], list_only=True)
        self.assertIn("unknown (legacy/unlabeled image)", output)
        self.assertNotIn("[RUNNING]", output)

    def test_unsupported_branch_is_visible_but_not_deployable(self):
        self.releases[0].update(branch="feature/new+layout", deployable=False)
        _result, output, dispatch = self.invoke(["1", "q"])
        self.assertIn("feature/new+layout", output)
        self.assertIn("VIEW ONLY", output)
        dispatch.assert_not_called()

    def test_remote_metadata_cannot_inject_terminal_controls(self):
        self.assertEqual(app.terminal_text("hello\n\x1b[2J\u202eevil"), "hello[2Jevil")
        self.assertEqual(len(app.terminal_text("x" * 200)), 100)

    def test_catalog_fetch_only_updates_private_refs_and_reads_metadata(self):
        browser = app.ReleaseBrowser(self.settings)
        browser.runner = Mock(spec=app.Runner)
        browser.runner.capture.side_effect = [next(iter(app.APPROVED_ORIGINS)), "",
            "refs/iec-deploy/catalog/v0.8\t" + "a" * 40,
            "2026-10-18T12:00:00Z\0Maintainer\0Fix\x1b[2J"]
        with patch.dict(sys.modules, {"fcntl": Mock(LOCK_EX=2, LOCK_NB=4)}):
            releases = browser.branches()
        self.assertEqual(releases[0]["branch"], "v0.8")
        self.assertNotIn("\x1b", releases[0]["subject"])
        commands = [call.args[0] for call in browser.runner.capture.call_args_list]
        self.assertIn(["git", "fetch", "--no-tags", "--prune", "--refmap=", "origin",
                       "+refs/heads/*:refs/iec-deploy/catalog/*"], commands)
        self.assertFalse(any("switch" in command or "merge" in command for command in commands))

    def test_catalog_refuses_to_fetch_during_a_deployment(self):
        browser = app.ReleaseBrowser(self.settings)
        browser.runner = Mock(spec=app.Runner)
        lock = Mock(LOCK_EX=2, LOCK_NB=4)
        lock.flock.side_effect = BlockingIOError
        with patch.dict(sys.modules, {"fcntl": lock}), self.assertRaisesRegex(app.DeployError, "deployment is running"):
            browser.branches()
        browser.runner.capture.assert_not_called()

    def test_live_sha_comes_from_actual_image_not_active_state_file(self):
        browser = app.ReleaseBrowser(self.settings)
        browser.runner = Mock(spec=app.Runner)
        browser.runner.capture.side_effect = ["ccccccc", "container-id",
            json.dumps([{"Image": "sha256:actual", "State": {"Health": {"Status": "healthy"}}}]),
            json.dumps([{"Config": {"Labels": {"org.opencontainers.image.revision": "a" * 40}}}])]
        self.assertEqual(browser.live(), {"commit": "a" * 40, "health": "healthy", "checkout": "ccccccc"})
        self.assertEqual(browser.runner.capture.call_args.args[0], ["docker", "image", "inspect", "sha256:actual"])

    def test_details_show_recent_history_and_database_warning(self):
        browser = app.ReleaseBrowser(self.settings)
        browser.runner = Mock(spec=app.Runner)
        browser.runner.capture.side_effect = ["aaaaaaa | 2026-10-18 | Example", "prisma/migrations/one/migration.sql\nprisma/migrations/migration_lock.toml"]
        with patch("sys.stdout", new_callable=io.StringIO) as output:
            browser.details(self.releases[0])
        self.assertIn("Migration files in this version: 1", output.getvalue())
        self.assertIn("does NOT restore old data", output.getvalue())


@unittest.skipUnless(shutil.which("git"), "Git is needed for the offline catalog integration test")
class CatalogIntegrationTests(Fixture):
    def test_real_git_catalog_refresh_preserves_checkout_and_prunes_deleted_branches(self):
        # A local URL rewrite prevents any network access while exercising actual Git refs.
        source = self.base / "remote"
        source.mkdir()
        env = dict(os.environ, GIT_CONFIG_NOSYSTEM="1", GIT_CONFIG_GLOBAL=os.devnull,
                   GIT_AUTHOR_NAME="Fixture", GIT_AUTHOR_EMAIL="fixture@example.invalid",
                   GIT_COMMITTER_NAME="Fixture", GIT_COMMITTER_EMAIL="fixture@example.invalid")
        def git(directory, *args):
            return subprocess.run(["git", "-C", str(directory), *args], env=env, check=True,
                                  stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=15).stdout.strip()
        git(source, "init", "-b", "main")
        (source / "README.md").write_text("Fixture", encoding="utf-8")
        git(source, "add", "README.md")
        git(source, "commit", "-m", "Fixture release")
        git(source, "branch", "v0.7")
        git(source, "branch", "v0.8")
        git(self.repo, "init", "-b", "local-only")
        git(self.repo, "config", "url." + source.as_uri() + ".insteadOf", "git@github.com:Amirmahdidarabian/IEC-ExpoTrack.git")
        git(self.repo, "remote", "add", "origin", "git@github.com:Amirmahdidarabian/IEC-ExpoTrack.git")
        browser = app.ReleaseBrowser(self.settings)
        browser.runner.env.update(env)
        original_capture = browser.runner.capture
        def capture(args, **kwargs):
            # get-url normally expands insteadOf; simulate the approved URL check only.
            if args == ["git", "remote", "get-url", "origin"]:
                return "git@github.com:Amirmahdidarabian/IEC-ExpoTrack.git"
            try:
                return original_capture(args, **kwargs)
            except app.DeployError as error:
                raise AssertionError((self.root / "browser.log").read_text(encoding="utf-8")) from error
        with patch.object(browser.runner, "capture", side_effect=capture), \
             patch.dict(sys.modules, {"fcntl": Mock(LOCK_EX=2, LOCK_NB=4)}):
            self.assertEqual([r["branch"] for r in browser.branches()], ["v0.8", "v0.7", "main"])
            git(source, "branch", "-D", "v0.7")
            self.assertEqual([r["branch"] for r in browser.branches()], ["v0.8", "main"])
        self.assertEqual(git(self.repo, "symbolic-ref", "--short", "HEAD"), "local-only")
        self.assertEqual(git(self.repo, "for-each-ref", "--format=%(refname)", "refs/remotes/origin/"), "")
        self.assertEqual((self.repo / ".env").read_text(), "")


if __name__ == "__main__":
    unittest.main()
