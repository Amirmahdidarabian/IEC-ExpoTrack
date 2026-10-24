#!/usr/bin/env python3
"""Root-only, dependency-free deployer for the existing IEC ExpoTrack Ubuntu VPS."""
from __future__ import annotations

import argparse
from dataclasses import dataclass
from datetime import datetime, timezone
import hashlib
from html.parser import HTMLParser
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import signal
import subprocess
import sys
import tarfile
import threading
import time
from urllib.parse import quote, urlsplit
from urllib.request import ProxyHandler, Request, build_opener
import uuid

VERSION = "1.1.1"
COMPOSE = "docker-compose.production.yml"
APPROVED_ORIGINS = {"https://github.com/Amirmahdidarabian/IEC-ExpoTrack.git",
                    "https://github.com/Amirmahdidarabian/IEC-ExpoTrack",
                    "git@github.com:Amirmahdidarabian/IEC-ExpoTrack.git"}
JOB_PATTERN = re.compile(r"\d{8}T\d{6}Z-[a-f0-9]{8}\Z")
TERMINAL = {"succeeded", "failed", "rolled_back", "needs_attention"}
MIGRATION_SQL = ('SELECT migration_name, checksum, (finished_at IS NOT NULL)::int, '
                 '(rolled_back_at IS NOT NULL)::int FROM "_prisma_migrations" ORDER BY migration_name, id')
# Runs with the image's own non-root user, with no secrets, mounts or database access.
# Embed it in the tool so checks also work for older releases without a probe script.
IMAGE_FILES_CHECK = r"""
const fs = require('node:fs');
try {
  if (typeof process.getuid !== 'function' || process.getuid() === 0) throw new Error('ROOT_USER');
  let files = 0;
  const visited = new Set();
  function check(path) {
    const real = fs.realpathSync(path);
    if (visited.has(real)) return;
    visited.add(real);
    const stat = fs.statSync(path);
    if (stat.isDirectory()) {
      fs.accessSync(path, fs.constants.R_OK | fs.constants.X_OK);
      for (const name of fs.readdirSync(path)) check(path + '/' + name);
    } else if (stat.isFile()) {
      const fd = fs.openSync(path, 'r'); fs.closeSync(fd); files++;
    } else throw new Error('UNSUPPORTED_FILE');
  }
  for (const path of ['/app/public', '/app/.next/static', '/app/node_modules/.prisma/client',
                      '/app/server.js', '/app/scripts/docker-start.mjs', '/app/scripts/runtime-env.mjs']) check(path);
  console.log('Non-root runtime file access OK (' + files + ' files)');
} catch (error) {
  console.error('Runtime file access check failed: ' + (error.code || error.message));
  process.exit(1);
}
"""


class DeployError(Exception):
    """A safe, user-facing error message; never embed raw configuration or credentials."""


@dataclass(frozen=True)
class Settings:
    repo: Path = Path("/opt/IEC-ExpoTrack")
    root: Path = Path("/var/backups/iec-expotrack/deployments")
    executable: Path = Path("/usr/local/bin/iec-deploy")
    public_url: str = "https://iecexpotracker.com"


def valid_branch(value: str) -> str:
    if (not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._/-]{0,119}", value)
            or ".." in value or "//" in value or value.endswith(("/", ".", ".lock"))
            or any(part.startswith(".") or part.endswith(".lock") for part in value.split("/"))
            or value in {"HEAD", "FETCH_HEAD"}):
        raise DeployError("Invalid branch name. Example: v0.8 or release/v0.8")
    return value


def private_dir(path: Path) -> None:
    if path.is_symlink():
        raise DeployError("Refusing a symlink as a deployment state directory.")
    path.mkdir(parents=True, exist_ok=True, mode=0o700)
    if os.name == "posix" and (path.stat().st_uid != 0 or path.stat().st_mode & 0o077):
        raise DeployError("Deployment state directory must be root-owned with mode 700.")


def save_json(path: Path, value: dict) -> None:
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    temporary.chmod(0o600)
    temporary.replace(path)


def file_hash(path: Path) -> str:
    result = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            result.update(chunk)
    return result.hexdigest()


def extract_source(archive: Path, destination: Path) -> None:
    """Only tracked, pinned Git files enter Docker's build context; never .env/untracked data."""
    destination.mkdir(mode=0o700)
    def source_directory(path: Path) -> None:
        # mkdir(mode=0755) is still masked by systemd's UMask=0077. Explicitly
        # normalize only tracked-source children; keep the context/job roots private.
        current = destination
        for part in path.relative_to(destination).parts:
            current = current / part
            current.mkdir(exist_ok=True, mode=0o755)
            current.chmod(0o755)
    with tarfile.open(archive, "r|") as source:
        for member in source:
            name = PurePosixPath(member.name)
            if name.is_absolute() or ".." in name.parts or "\\" in member.name or not (member.isdir() or member.isfile()):
                raise DeployError("Unsafe path/link in release archive; refusing to extract it.")
            target = destination.joinpath(*name.parts)
            if not target.resolve().is_relative_to(destination.resolve()):
                raise DeployError("Release archive escaped its isolated build directory.")
            if member.isdir():
                source_directory(target)
            else:
                source_directory(target.parent)
                with source.extractfile(member) as reader, target.open("xb") as output:
                    shutil.copyfileobj(reader, output, 1024 * 1024)
                target.chmod(0o755 if member.mode & 0o111 else 0o644)


class Log:
    def __init__(self, path: Path):
        self.path = path
        self.secrets: set[str] = set()
        self.lock = threading.Lock()

    def add_secrets(self, values: dict) -> None:
        for key, value in values.items():
            if re.search(r"PASSWORD|SECRET|TOKEN|API_KEY|DATABASE_URL", key, re.I) and value:
                self.secrets.update({str(value), quote(str(value), safe="")})

    def redact(self, text: str) -> str:
        for secret in sorted(self.secrets, key=len, reverse=True):
            text = text.replace(secret, "[REDACTED]")
        return re.sub(r"(\w+://)[^\s/@]+:[^\s/@]+@", r"\1[REDACTED]@", text)

    def write(self, message: str) -> None:
        with self.lock, self.path.open("a", encoding="utf-8") as output:
            output.write(self.redact(message).rstrip() + "\n")


class Runner:
    def __init__(self, settings: Settings, log: Log):
        self.settings, self.log = settings, log
        self.env = dict(os.environ, GIT_TERMINAL_PROMPT="0",
                        GIT_SSH_COMMAND="ssh -o BatchMode=yes -o ConnectTimeout=15")

    def capture_bytes(self, args: list[str], *, data: bytes | None = None, timeout: int = 120) -> bytes:
        try:
            result = subprocess.run(args, cwd=self.settings.repo, env=self.env, input=data,
                                    stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=timeout, check=False)
        except (OSError, subprocess.TimeoutExpired) as error:
            raise DeployError(f"{Path(args[0]).name} could not finish; check dependencies/connectivity.") from error
        if result.returncode:
            # In particular, never dump `compose config` or its interpolated environment.
            if args[0] == "git":
                self.log.write(result.stderr.decode("utf-8", errors="replace")[-3000:])
            raise DeployError(f"{Path(args[0]).name} command failed (exit {result.returncode}).")
        return result.stdout

    def capture(self, args: list[str], *, data: bytes | None = None, timeout: int = 120) -> str:
        return self.capture_bytes(args, data=data, timeout=timeout).decode("utf-8", errors="replace").strip()

    def stream(self, args: list[str], *, timeout: int = 1800) -> None:
        process = subprocess.Popen(args, cwd=self.settings.repo, env=self.env, stdout=subprocess.PIPE,
                                   stderr=subprocess.STDOUT, text=True, encoding="utf-8", errors="replace")
        def read_output() -> None:
            assert process.stdout is not None
            for line in process.stdout:
                self.log.write(line)
        reader = threading.Thread(target=read_output, daemon=True)
        reader.start()
        try:
            code = process.wait(timeout=timeout)
        except BaseException:
            process.terminate()
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
            raise
        finally:
            reader.join(timeout=10)
        if code:
            raise DeployError(f"{Path(args[0]).name} command failed (exit {code}); see the private deployment log.")

    def dump(self, args: list[str], destination: Path, *, label: str = "Database backup") -> None:
        with destination.open("xb") as output:
            result = subprocess.run(args, cwd=self.settings.repo, env=self.env, stdout=output,
                                    stderr=subprocess.PIPE, timeout=600, check=False)
        if result.returncode or destination.stat().st_size == 0:
            raise DeployError(f"{label} failed; deployment has not started.")

    def verify_dump(self, container: str, archive: Path) -> None:
        with archive.open("rb") as source:
            result = subprocess.run(["docker", "exec", "-i", container, "pg_restore", "--list"],
                                    cwd=self.settings.repo, env=self.env, stdin=source,
                                    stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, timeout=120, check=False)
        if result.returncode:
            raise DeployError("Backup archive listing failed; deployment has not started.")


def validate_compose(current: dict, candidate: dict, repo: Path) -> None:
    services = candidate.get("services", {})
    if set(services) != {"app", "db", "migrate"}:
        raise DeployError("Infrastructure change detected: services must remain app/db/migrate. Review manually.")
    if candidate.get("secrets") or candidate.get("configs"):
        raise DeployError("Additional host configuration/secrets mounts require manual infrastructure review.")
    for key in ("networks", "volumes"):
        if candidate.get(key) != current.get(key):
            raise DeployError(f"Infrastructure change detected: {key}. Review manually.")
    if services["db"] != current["services"]["db"] or services["db"].get("ports"):
        raise DeployError("Database container configuration changed; automatic deployment is refused.")
    ports = services["app"].get("ports", [])
    if (len(ports) != 1 or str(ports[0].get("published")) != "3000"
            or str(ports[0].get("target")) != "3000" or ports[0].get("host_ip") != "127.0.0.1"
            or ports[0].get("protocol", "tcp") != "tcp"):
        raise DeployError("App must publish only 127.0.0.1:3000:3000.")
    for name in ("app", "migrate"):
        service = services[name]
        build = service.get("build", {})
        if (not isinstance(build, dict) or Path(build.get("context", "")).resolve() != repo.resolve()
                or build.get("dockerfile_inline") or build.get("additional_contexts")):
            raise DeployError("Build context must remain the existing repository.")
        dockerfile = (repo / build.get("dockerfile", "Dockerfile")).resolve()
        if not dockerfile.is_relative_to(repo.resolve()):
            raise DeployError("Dockerfile must remain inside the repository.")
        if (service.get("privileged") or service.get("cap_add") or service.get("network_mode")
                or service.get("volumes") or service.get("devices") or service.get("secrets") or service.get("configs")
                or (service.get("ports") and name == "migrate")):
            raise DeployError("Unexpected privileged service, mount or port; review manually.")
        if service.get("networks") != current["services"][name].get("networks"):
            raise DeployError("Service networks changed; review infrastructure manually.")
    if services["app"].get("user") not in {None, "nextjs", "1001", "1001:1001"}:
        raise DeployError("Unexpected app user override; review manually.")
    if ("ALL" not in services["app"].get("cap_drop", [])
            or not any(str(item) in {"no-new-privileges:true", "no-new-privileges"} for item in services["app"].get("security_opt", []))):
        raise DeployError("Existing app security settings must be preserved.")


def check_tracked_files(paths: list[str]) -> None:
    allowed_env = {".env.example", ".env.production.example"}
    for value in paths:
        path = Path(value)
        if ((path.name.startswith(".env") and value not in allowed_env)
                or value.startswith(("outputs/", "backups/", "data/imports/", ".next/"))
                or path.suffix.lower() in {".dump", ".backup", ".pem", ".key", ".p12", ".pfx"}):
            raise DeployError("Release tracks a sensitive/generated file; refusing deployment.")


class AssetParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.paths: set[str] = set()

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attributes = dict(attrs)
        value = attributes.get("src") if tag == "script" else attributes.get("href") if tag == "link" and attributes.get("rel") == "stylesheet" else None
        if value and (value.startswith("/_next/static/") or value == "/theme-init.js") and not urlsplit(value).netloc:
            self.paths.add(value)


def get_url(url: str, *, expected_type: str | None = None) -> bytes:
    # No session cookies, credentials, TLS bypass, or inherited HTTP proxy.
    opener = build_opener(ProxyHandler({}))
    with opener.open(Request(url, headers={"User-Agent": "IEC-Deploy/" + VERSION}), timeout=15) as response:
        mime = response.headers.get("Content-Type", "").split(";", 1)[0].lower()
        allowed = {"text/javascript", "application/javascript"} if expected_type == "javascript" else {expected_type}
        if response.status != 200 or (expected_type and mime not in allowed):
            raise DeployError("Unexpected HTTP status or content type during verification.")
        result = response.read(2 * 1024 * 1024 + 1)
        if not result or len(result) > 2 * 1024 * 1024:
            raise DeployError("Empty/oversized response during verification.")
        length = response.headers.get("Content-Length")
        if length is not None and int(length) != len(result):
            raise DeployError("Incomplete HTTP response during verification.")
        return result


class Deployment:
    def __init__(self, settings: Settings, directory: Path, state: dict):
        self.settings, self.directory, self.state = settings, directory, state
        self.log = Log(directory / "deploy.log")
        self.runner = Runner(settings, self.log)
        self.project: str | None = None
        self.cutover = False
        self.checkout_changed = False
        self.local_verified = False
        self.before_migrations = ""
        self.before_schema = ""

    def stage(self, phase: str, **fields) -> None:
        self.state.update(phase=phase, **fields)
        save_json(self.directory / "state.json", self.state)
        self.log.write(f"[{datetime.now(timezone.utc).isoformat(timespec='seconds')}] {phase}")

    def git(self, *args: str) -> str:
        return self.runner.capture(["git", *args])

    def compose(self, *args: str, previous: bool = False, candidate: bool = False) -> list[str]:
        command = ["docker", "compose", "--project-directory", str(self.settings.repo), "--env-file", str(self.settings.repo / ".env")]
        if self.project:
            command += ["--project-name", self.project]
        source = self.directory / ("previous-compose.yml" if previous else "candidate-compose.yml")
        command += ["-f", str(source) if source.exists() else str(self.settings.repo / COMPOSE)]
        if candidate:
            command += ["-f", str(self.directory / "release.override.json")]
        if previous:
            command += ["-f", str(self.directory / "rollback.override.json")]
        return command + list(args)

    def db_command(self, sql: str) -> list[str]:
        return ["docker", "exec", self.state["database_container"], "sh", "-c",
                'exec psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -F "|" -c "$1"', "sh", sql]

    def migrations(self) -> str:
        return self.runner.capture(self.db_command(MIGRATION_SQL))

    def schema_fingerprint(self) -> str:
        schema = self.runner.capture(["docker", "exec", self.state["database_container"], "sh", "-c",
                                      'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --schema-only --no-owner --no-privileges'])
        # PostgreSQL's archive restriction tokens are randomized; they are not schema changes.
        normalized = "\n".join(line for line in schema.splitlines()
                               if not line.startswith(("\\restrict ", "\\unrestrict ", "--")))
        return hashlib.sha256(normalized.encode("utf-8")).hexdigest()

    def verify_local(self) -> None:
        expected = {"status": "ok"}
        if json.loads(get_url("http://127.0.0.1:3000/api/health")) != expected:
            raise DeployError("Local health response is not OK.")
        parser = AssetParser()
        parser.feed(get_url("http://127.0.0.1:3000/", expected_type="text/html").decode("utf-8", errors="replace"))
        if not parser.paths or len(parser.paths) > 64:
            raise DeployError("Homepage did not expose the expected JavaScript/CSS assets.")
        for path in sorted(parser.paths):
            expected_type = "text/css" if urlsplit(path).path.endswith(".css") else "javascript"
            body = get_url("http://127.0.0.1:3000" + path, expected_type=expected_type)
            if body.lstrip().lower().startswith((b"<!doctype html", b"<html")):
                raise DeployError("A JavaScript/CSS asset returned HTML.")
        self.log.write(f"Local homepage and {len(parser.paths)} static assets received completely.")

    def wait_healthy(self, *, previous: bool = False) -> None:
        for _ in range(60):
            container = self.runner.capture(self.compose("ps", "-a", "-q", "app", previous=previous, candidate=not previous))
            if container:
                status = json.loads(self.runner.capture(["docker", "inspect", container]))[0]["State"]
                if status.get("Status") in {"exited", "dead", "restarting"}:
                    raise DeployError(f"App stopped or is restarting (exit code {status.get('ExitCode', 'unknown')}, "
                                      f"OOMKilled={bool(status.get('OOMKilled', False))}). Inspect app logs; this was not a 120-second timeout.")
                if status.get("Health", {}).get("Status") == "unhealthy":
                    raise DeployError("App healthcheck failed. Inspect app logs; this was not a 120-second timeout.")
                if status.get("Status") == "running" and status.get("Health", {}).get("Status") == "healthy":
                    return
            time.sleep(2)
        raise DeployError("App did not become healthy within 120 seconds.")

    def verify_image_files(self, image_id: str) -> None:
        try:
            output = self.runner.capture(["docker", "run", "--rm", "--network", "none", "--read-only",
                                          "--cap-drop", "ALL", "--security-opt", "no-new-privileges:true",
                                          "--entrypoint", "node", image_id, "-e", IMAGE_FILES_CHECK], timeout=60)
        except DeployError as error:
            raise DeployError("Non-root image file check failed before migrations or app replacement. "
                              "Verify public/fonts, static assets and runtime file permissions in the Dockerfile.") from error
        self.log.write(output)

    def prepare(self) -> dict:
        self.stage("Preflight", status="running")
        if self.settings.repo.is_symlink() or self.git("rev-parse", "--show-toplevel") != str(self.settings.repo):
            raise DeployError("Repository path does not match the configured production repository.")
        env = self.settings.repo / ".env"
        if not env.is_file() or env.is_symlink():
            raise DeployError("A regular existing .env file is required; it will not be overwritten.")
        if self.git("status", "--porcelain"):
            raise DeployError("Working tree is dirty. Preserve/review local changes before deployment.")
        origin = self.git("remote", "get-url", "origin")
        if origin not in APPROVED_ORIGINS:
            raise DeployError("Origin is not the approved IEC ExpoTrack GitHub repository.")
        old_sha = self.git("rev-parse", "HEAD")
        (self.directory / "previous-compose.yml").write_text(self.git("show", old_sha + ":" + COMPOSE) + "\n", encoding="utf-8")
        # Read current configuration before a candidate-compose file exists.
        current = json.loads(self.runner.capture(self.compose("config", "--format", "json")))
        self.project = current["name"]
        for service in current["services"].values():
            self.log.add_secrets(service.get("environment", {}))
        app = self.runner.capture(self.compose("ps", "-q", "app"))
        database = self.runner.capture(self.compose("ps", "-q", "db"))
        if not app or not database:
            raise DeployError("Existing app and database containers must already be running.")
        actual = json.loads(self.runner.capture(["docker", "inspect", app]))[0]
        if actual["Config"]["Labels"].get("com.docker.compose.project") != self.project:
            raise DeployError("Compose project does not match the actual running app.")
        actual_environment = dict(value.split("=", 1) for value in actual["Config"].get("Env", []) if "=" in value)
        self.log.add_secrets(actual_environment)
        if any(actual_environment.get(key) != str(value) for key, value in current["services"]["app"].get("environment", {}).items()):
            raise DeployError("Running app environment differs from the current .env/Compose configuration; review manually.")
        if actual["State"].get("Health", {}).get("Status") != "healthy":
            raise DeployError("Existing app is unhealthy. Diagnose the incident before routine deployment.")
        self.stage("Fetching branch", previous_commit=old_sha, database_container=database,
                   previous_image=actual["Image"], project=self.project, env_checksum=file_hash(env))
        branch = valid_branch(self.state["branch"])
        self.git("check-ref-format", "--branch", branch)
        self.git("fetch", "--no-tags", "origin", f"refs/heads/{branch}:refs/remotes/origin/{branch}")
        target = self.git("rev-parse", "--verify", "refs/remotes/origin/" + branch + "^{commit}")
        if self.state.get("expected_commit") and target != self.state["expected_commit"]:
            raise DeployError("Branch changed since your preview. Open the menu again and review the new commit.")
        tracked = self.runner.capture_bytes(["git", "ls-tree", "-rz", "--name-only", target]).decode("utf-8").strip("\0").split("\0")
        check_tracked_files(tracked)
        candidate_path = self.directory / "candidate-compose.yml"
        candidate_path.write_text(self.git("show", target + ":" + COMPOSE) + "\n", encoding="utf-8")
        candidate = json.loads(self.runner.capture(self.compose("config", "--format", "json")))
        validate_compose(current, candidate, self.settings.repo)
        self.before_migrations = self.migrations()
        self.before_schema = self.schema_fingerprint()
        for line in self.before_migrations.splitlines():
            name, checksum, finished, rolled_back = line.split("|")
            if rolled_back == "1":
                continue
            if finished != "1":
                raise DeployError("An unfinished database migration exists; manual review is required.")
            blob = self.runner.capture_bytes(["git", "show", f"{target}:prisma/migrations/{name}/migration.sql"])
            if hashlib.sha256(blob).hexdigest() != checksum:
                raise DeployError("Release removes/changes an already-applied migration. Review manually.")
        docker_root = self.runner.capture(["docker", "info", "--format", "{{.DockerRootDir}}"])
        database_size = int(self.runner.capture(self.db_command("SELECT pg_database_size(current_database())")))
        for path in (self.directory, Path(docker_root)):
            if shutil.disk_usage(path).free < max(2 * 1024**3, database_size * 2 + 1024**3):
                raise DeployError("Insufficient disk space for a safe backup/build; no cleanup is performed automatically.")
        self.stage("Release pinned", target_commit=target)
        return candidate

    def backup(self) -> None:
        self.stage("Backing up PostgreSQL")
        backup = self.directory / "database.dump"
        rollback = "iec-expotrack-app:rollback-" + self.state["id"].lower()
        self.runner.capture(["docker", "image", "tag", self.state["previous_image"], rollback])
        self.stage("Rollback image saved", rollback_image=rollback)
        self.runner.dump(["docker", "exec", self.state["database_container"], "sh", "-c",
                          'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc'], backup)
        # Read the archive inside the already-running DB container; never restore it.
        self.runner.verify_dump(self.state["database_container"], backup)
        save_json(self.directory / "rollback.override.json", {"services": {"app": {"image": rollback}}})
        self.stage("Backup archive checked", backup=str(backup), backup_sha256=file_hash(backup),
                   migrations_before=self.before_migrations, schema_before=self.before_schema)

    def checkout(self) -> None:
        branch, target = self.state["branch"], self.state["target_commit"]
        local = self.runner.capture(["git", "for-each-ref", "--format=%(refname)", "refs/heads/" + branch])
        if "refs/heads/" + branch in local.splitlines():
            self.git("merge-base", "--is-ancestor", "refs/heads/" + branch, target)
            self.git("switch", branch)
            self.checkout_changed = True
            self.git("merge", "--ff-only", target)
        else:
            self.git("switch", "--track", "-c", branch, "origin/" + branch)
            self.checkout_changed = True
        if self.git("rev-parse", "HEAD") != target or self.git("status", "--porcelain"):
            raise DeployError("Checkout does not match the pinned clean release.")

    def recover(self) -> None:
        if self.local_verified:
            self.stage("Local app is healthy; public verification failed. No automatic rollback.", status="needs_attention")
            return
        if self.cutover:
            try:
                if (self.migrations() != self.before_migrations or self.schema_fingerprint() != self.before_schema
                        or file_hash(self.settings.repo / ".env") != self.state["env_checksum"]):
                    self.stage("Schema/migration state changed; automatic app rollback refused. Database is not restored.", status="needs_attention")
                    return
                self.stage("Rolling back app image only")
                self.runner.stream(self.compose("up", "-d", "--no-deps", "--no-build", "--pull", "never", "app", previous=True), timeout=180)
                self.wait_healthy(previous=True)
                self.verify_local()
                if not self.git("status", "--porcelain"):
                    self.git("switch", "--detach", self.state["previous_commit"])
                self.stage("Previous app recovered; database was not restored", status="rolled_back")
            except Exception:
                self.stage("Automatic recovery could not be verified; manual review required", status="needs_attention")
        else:
            # Migrations may already have changed schema; old running app is deliberately untouched.
            if self.checkout_changed and not self.git("status", "--porcelain"):
                self.git("switch", "--detach", self.state["previous_commit"])
            self.stage("Stopped before app replacement; existing app and database were not restarted", status="failed")

    def run(self) -> int:
        try:
            self.prepare()
            self.backup()
            self.stage("Checking out pinned release")
            self.checkout()
            target = self.state["target_commit"]
            self.stage("Exporting tracked source to an isolated build context")
            archive = self.directory / "source.tar"
            source = self.directory / "source"
            self.runner.dump(["git", "archive", "--format=tar", target], archive, label="Source export")
            extract_source(archive, source)
            image = "iec-expotrack-app:release-" + self.state["id"].lower()
            migration_image = "iec-expotrack-migrate:release-" + self.state["id"].lower()
            labels = {"org.opencontainers.image.revision": target}
            save_json(self.directory / "release.override.json", {"services": {
                "app": {"image": image, "build": {"context": str(source), "labels": labels}, "labels": labels},
                "migrate": {"image": migration_image, "build": {"context": str(source), "labels": labels}},
            }})
            self.stage("Building app and pinned migration runner; current app stays online")
            self.runner.stream(self.compose("build", "app", "migrate", candidate=True))
            built = json.loads(self.runner.capture(["docker", "image", "inspect", image]))[0]
            if (built["Config"].get("User", "").split(":")[0] in {"", "0", "root"}
                    or built["Config"].get("Labels", {}).get("org.opencontainers.image.revision") != target):
                raise DeployError("Built app must be non-root and labeled with the pinned commit.")
            self.stage("Checking runtime file access as the image's non-root user before migrations")
            self.verify_image_files(built["Id"])
            if file_hash(self.settings.repo / ".env") != self.state["env_checksum"]:
                raise DeployError(".env changed during deployment; refusing cutover.")
            if self.git("rev-parse", "HEAD") != target or self.git("status", "--porcelain"):
                raise DeployError("Repository changed during the build; refusing cutover.")
            migrator = json.loads(self.runner.capture(["docker", "image", "inspect", migration_image]))[0]
            if migrator["Config"].get("Cmd") != ["npx", "prisma", "migrate", "deploy"]:
                raise DeployError("Migration image must run the project-pinned prisma migrate deploy command.")
            self.stage("Applying migrations with the project-pinned Prisma image")
            self.runner.stream(self.compose("run", "--rm", "--no-deps", "-T", "migrate", candidate=True), timeout=600)
            self.stage("Replacing app only; database container is not recreated")
            self.cutover = True
            self.runner.stream(self.compose("up", "-d", "--no-deps", "--no-build", "--pull", "never", "app", candidate=True), timeout=180)
            self.wait_healthy()
            container = self.runner.capture(self.compose("ps", "-q", "app", candidate=True))
            running_image = self.runner.capture(["docker", "inspect", "--format", "{{.Image}}", container])
            if running_image != built["Id"]:
                raise DeployError("Running app does not match the newly built image.")
            self.verify_local()
            self.local_verified = True
            self.stage("Verifying public HTTPS")
            if json.loads(get_url(self.settings.public_url + "/api/health")) != {"status": "ok"}:
                raise DeployError("Public health response is not OK.")
            save_json(self.settings.root / "active.json", {"id": self.state["id"], "commit": target, "image": image})
            self.stage("Deployment checks passed; verify signed-in UI from a real device", status="succeeded", image=image)
            return 0
        except Exception as error:
            # Unknown errors are kept generic: raw subprocess/HTTP exception strings can contain credentials.
            message = str(error) if isinstance(error, DeployError) else "Unexpected failure; inspect the current phase and private log."
            self.log.write("ERROR: " + message)
            try:
                self.recover()
            except Exception:
                self.stage("Recovery could not be verified; manual review required", status="needs_attention")
            return 1


def job_directory(settings: Settings, value: str) -> Path:
    if not JOB_PATTERN.fullmatch(value):
        raise DeployError("Invalid job ID.")
    path = settings.root / value
    if path.is_symlink() or not path.is_dir():
        raise DeployError("Job directory is missing or is a symlink.")
    return path


def selected_job(settings: Settings, value: str | None) -> Path:
    if value:
        return job_directory(settings, value)
    jobs = sorted(path.name for path in settings.root.iterdir() if JOB_PATTERN.fullmatch(path.name)) if settings.root.exists() else []
    if not jobs:
        raise DeployError("No deployment jobs yet.")
    return job_directory(settings, jobs[-1])


def follow(settings: Settings, directory: Path) -> int:
    offset = 0
    polls = 0
    try:
        while True:
            log = directory / "deploy.log"
            if log.exists():
                with log.open(encoding="utf-8") as source:
                    source.seek(offset)
                    print(source.read(), end="", flush=True)
                    offset = source.tell()
            state = json.loads((directory / "state.json").read_text(encoding="utf-8"))
            if state["status"] in TERMINAL:
                print(f"\nJob: {state['id']} | Status: {state['status']}\nFiles: {directory}")
                return 0 if state["status"] == "succeeded" else 1
            if polls % 5 == 0:
                unit = "iec-expotrack-deploy-" + state["id"].lower() + ".service"
                service = subprocess.run(["systemctl", "show", unit, "--property=ActiveState", "--value"],
                                         stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True, timeout=10, check=False)
                if service.stdout.strip() not in {"active", "activating", "reloading", "deactivating"}:
                    # Re-read after querying systemd to avoid misreporting a just-completed job.
                    current = json.loads((directory / "state.json").read_text(encoding="utf-8"))
                    if current["status"] not in TERMINAL:
                        print("Worker is no longer active without a final result. Do not rerun; inspect status/logs and the systemd journal.")
                        return 1
            polls += 1
            time.sleep(1)
    except KeyboardInterrupt:
        print("\nStopped viewing logs only. Deployment continues in systemd. Run: sudo iec-deploy status")
        return 0


def worker(settings: Settings, value: str) -> int:
    import fcntl  # Linux only; UI/control and unit tests remain importable on Windows.
    private_dir(settings.root)
    directory = job_directory(settings, value)
    state = json.loads((directory / "state.json").read_text(encoding="utf-8"))
    valid_branch(state["branch"])
    if state["status"] != "queued":
        raise DeployError("Job has already run; refusing to replay it.")
    with (settings.root / "deploy.lock").open("a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            state.update(status="failed", phase="Another deployment is already running")
            save_json(directory / "state.json", state)
            return 1
        def interrupted(_signum, _frame):
            raise DeployError("Deployment was interrupted; inspect the saved phase before retrying.")
        signal.signal(signal.SIGTERM, interrupted)
        return Deployment(settings, directory, state).run()


def dispatch(settings: Settings, branch: str, expected_commit: str | None = None) -> int:
    branch = valid_branch(branch)
    private_dir(settings.root)
    for dependency in ("docker", "git", "systemd-run", "systemctl"):
        if not shutil.which(dependency):
            raise DeployError(f"Required Ubuntu command is missing: {dependency}")
    if not settings.executable.is_file():
        raise DeployError("Install this tool to /usr/local/bin/iec-deploy first.")
    identifier = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ-") + uuid.uuid4().hex[:8]
    directory = settings.root / identifier
    private_dir(directory)
    state = {"id": identifier, "branch": branch, "status": "queued", "phase": "Queued", "tool_version": VERSION}
    if expected_commit:
        if not re.fullmatch(r"[a-f0-9]{40}", expected_commit):
            raise DeployError("Invalid preview commit.")
        state["expected_commit"] = expected_commit
    save_json(directory / "state.json", state)
    unit = "iec-expotrack-deploy-" + identifier.lower()
    command = ["systemd-run", "--quiet", "--collect", "--service-type=exec", "--unit=" + unit,
               "--uid=root", "--property=UMask=0077", "--property=RuntimeMaxSec=3600",
               "--property=WorkingDirectory=" + str(settings.repo), "--setenv=HOME=/root",
               str(settings.executable), "__worker", identifier]
    try:
        result = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False, timeout=30)
        started = result.returncode == 0
    except (OSError, subprocess.TimeoutExpired):
        started = False
    if not started:
        state.update(status="failed", phase="systemd could not start the job")
        save_json(directory / "state.json", state)
        raise DeployError("systemd could not start deployment. Check systemd availability/permissions.")
    print(f"Job: {identifier}\nDeployment continues even if SSH disconnects. Ctrl+C stops viewing only.", flush=True)
    return follow(settings, directory)


def terminal_text(value: str, limit: int = 100) -> str:
    """Remote commit messages must not inject terminal escapes, newlines or bidi controls."""
    return "".join(c for c in value if c.isprintable() and c not in "\u202a\u202b\u202c\u202d\u202e\u2066\u2067\u2068\u2069")[:limit]


class ReleaseBrowser:
    def __init__(self, settings: Settings):
        self.settings = settings
        private_dir(settings.root)
        self.runner = Runner(settings, Log(settings.root / "browser.log"))

    def git(self, *args: str) -> str:
        return self.runner.capture(["git", *args])

    def branches(self) -> list[dict]:
        import fcntl
        # Use a separate ref namespace: no checkout, local branch or origin tracking changes.
        with (self.settings.root / "deploy.lock").open("a") as lock:
            try:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError as error:
                raise DeployError("A deployment is running. Use iec-deploy status/logs and reopen the menu afterwards.") from error
            if self.git("remote", "get-url", "origin") not in APPROVED_ORIGINS:
                raise DeployError("Origin is not the approved IEC ExpoTrack GitHub repository.")
            self.git("fetch", "--no-tags", "--prune", "--refmap=", "origin", "+refs/heads/*:refs/iec-deploy/catalog/*")
            lines = self.git("for-each-ref", "--sort=-version:refname", "--format=%(refname)%09%(objectname)",
                             "refs/iec-deploy/catalog/")
            releases = []
            for line in lines.splitlines():
                ref, sha = line.split("\t")
                branch = ref.removeprefix("refs/iec-deploy/catalog/")
                deployable = True
                try:
                    valid_branch(branch)
                except DeployError:
                    deployable = False
                date, author, subject = self.git("show", "-s", "--format=%cI%x00%an%x00%s", sha).split("\0", 2)
                releases.append({"branch": branch, "deployable": deployable, "commit": sha, "date": terminal_text(date, 35),
                                 "author": terminal_text(author, 60), "subject": terminal_text(subject)})
            return releases

    def live(self) -> dict:
        """Inspect the actual container; repository HEAD is not proof of the deployed version."""
        result = {"commit": None, "health": "unknown", "checkout": terminal_text(self.git("rev-parse", "--short", "HEAD"))}
        try:
            container = self.runner.capture(["docker", "compose", "--project-directory", str(self.settings.repo),
                                             "--env-file", str(self.settings.repo / ".env"), "-f",
                                             str(self.settings.repo / COMPOSE), "ps", "-q", "app"])
            if container:
                actual = json.loads(self.runner.capture(["docker", "inspect", container]))[0]
                image = json.loads(self.runner.capture(["docker", "image", "inspect", actual["Image"]]))[0]
                sha = image.get("Config", {}).get("Labels", {}).get("org.opencontainers.image.revision", "")
                result["commit"] = sha if re.fullmatch(r"[a-f0-9]{40}", sha) else None
                result["health"] = terminal_text(actual.get("State", {}).get("Health", {}).get("Status", "unknown"), 20)
        except (DeployError, KeyError, ValueError, IndexError):
            pass
        return result

    def details(self, release: dict) -> None:
        print(f"\nBranch: {terminal_text(release['branch'], 120)}\nCommit: {release['commit']}\nUpdated: {release['date']}\nAuthor: {release['author']}")
        print("\nLast 5 commits:")
        for line in self.git("log", "-5", "--format=%h | %cs | %s", release["commit"]).splitlines():
            print("  " + terminal_text(line, 140))
        paths = self.git("ls-tree", "-r", "--name-only", release["commit"], "prisma/migrations/").splitlines()
        print(f"Migration files in this version: {sum(path.endswith('/migration.sql') for path in paths)}")
        print("\nSelecting an older version does NOT restore old data. Missing/changed applied migrations block deployment.")
        print("A fresh backup and all existing deployment checks run after confirmation.")


def menu(settings: Settings, preferred: str | None = None, *, list_only: bool = False) -> int:
    browser = ReleaseBrowser(settings)
    while True:
        print("\nIEC Deploy - GitHub versions\nRefreshing branch metadata only; the site is not changed.", flush=True)
        releases = browser.branches()
        live = browser.live()
        print(f"Running image commit: {live['commit'] or 'unknown (legacy/unlabeled image)'} | Health: {live['health']}")
        print(f"Repository checkout: {live['checkout']} (not necessarily the running version)\n")
        for number, release in enumerate(releases, 1):
            marker = " [RUNNING]" if release["commit"] == live["commit"] else ""
            if not release.get("deployable", True):
                marker += " [UNSUPPORTED NAME - VIEW ONLY]"
            print(f"{number:>3}. {terminal_text(release['branch'], 120)}{marker} | {release['commit'][:12]} | {release['date']}")
            print(f"     {release['author']} - {release['subject']}")
        if not releases:
            raise DeployError("No GitHub branches found.")
        if list_only:
            return 0
        print("\nEnter a number or branch name. r = refresh, q = exit without changes.")
        choice = preferred if preferred is not None else input("Select version: ").strip()
        preferred = None
        if choice.lower() in {"q", "quit", "exit", ""}:
            return 0
        if choice.lower() == "r":
            continue
        release = next((item for index, item in enumerate(releases, 1)
                        if choice == str(index) or choice == item["branch"]), None)
        if release is None:
            print("Version not found. Choose a listed branch.")
            continue
        browser.details(release)
        if not release.get("deployable", True):
            print("This branch name is outside the deployer's safety policy. Use a reviewed release branch such as v0.8.")
            continue
        if release["commit"] == live["commit"]:
            print("This commit is already running; no deployment started.")
            continue
        required = "deploy " + release["branch"]
        if input(f"\nTo publish this version, type '{required}' (anything else cancels): ").strip() != required:
            print("Cancelled. No deployment started.")
            continue
        return dispatch(settings, release["branch"], expected_commit=release["commit"])


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="IEC ExpoTrack Ubuntu deployment: iec-deploy v0.8")
    parser.add_argument("action", nargs="?", help="menu, branches, branch name, status, or logs")
    parser.add_argument("job", nargs="?", help="optional job ID for status/logs")
    parser.add_argument("--version", action="version", version=VERSION)
    args = parser.parse_args(argv)
    if os.name != "posix" or not hasattr(os, "geteuid") or os.geteuid() != 0:
        raise DeployError("Run on the Ubuntu server with sudo/root. Do not run deployment on Windows.")
    os.umask(0o077)
    settings = Settings()
    if args.action == "__worker":
        return worker(settings, args.job or "")
    if args.action in {"status", "logs"}:
        directory = selected_job(settings, args.job)
        if args.action == "logs":
            return follow(settings, directory)
        print((directory / "state.json").read_text(encoding="utf-8"))
        return 0
    if args.job:
        raise DeployError("Only one branch argument is accepted. Example: sudo iec-deploy v0.8")
    try:
        return menu(settings, None if args.action in {None, "menu", "branches"} else valid_branch(args.action),
                    list_only=args.action == "branches")
    except (EOFError, KeyboardInterrupt):
        print("\nMenu closed. No new deployment started.")
        return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except DeployError as error:
        print("STOP: " + str(error), file=sys.stderr)
        raise SystemExit(1)
