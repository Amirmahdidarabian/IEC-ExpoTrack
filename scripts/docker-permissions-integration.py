#!/usr/bin/env python3
"""Build and probe synthetic local Docker images. No secrets, database or VPS access."""
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import uuid

ROOT = Path(__file__).resolve().parents[1]
sys.dont_write_bytecode = True
SPEC = importlib.util.spec_from_file_location("iec_deployer_permissions", ROOT / "deploy" / "iec-deploy.py")
app = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = app
SPEC.loader.exec_module(app)


def main():
    if json.loads((ROOT / "package.json").read_text(encoding="utf-8"))["name"] != "iec-expotrack":
        raise RuntimeError("IEC repository required")
    def run(args, **kwargs):
        return subprocess.run(args, cwd=ROOT, check=True, **kwargs)
    if run(["docker", "info", "--format", "{{.OSType}}"], stdout=subprocess.PIPE, text=True).stdout.strip() != "linux":
        raise RuntimeError("A local Linux Docker engine is required")
    identifier = uuid.uuid4().hex
    image = "iec-expotrack-app:permissions-test-" + identifier
    broken = "iec-expotrack-app:permissions-negative-" + identifier
    # The normal .dockerignore excludes actual .env files, outputs and local data.
    # Simulate the production failure INSIDE the Linux builder even on Windows.
    source = (ROOT / "Dockerfile").read_text(encoding="utf-8")
    marker = "COPY . .\n"
    if source.count(marker) != 1:
        raise RuntimeError("Review the fixture injection for the current Dockerfile")
    fixture = source.replace(marker, marker + "RUN find /app/public -type d -exec chmod 700 {} + && find /app/public -type f -exec chmod 600 {} +\n")
    try:
        with tempfile.TemporaryDirectory(prefix="iec-image-permissions-") as temporary:
            dockerfile = Path(temporary) / "Dockerfile"
            dockerfile.write_text(fixture, encoding="utf-8", newline="\n")
            run(["docker", "build", "--file", str(dockerfile), "--tag", image, str(ROOT)])
            def probe(target, *, check=True):
                return subprocess.run(["docker", "run", "--rm", "--network", "none", "--read-only", "--cap-drop", "ALL",
                                       "--security-opt", "no-new-privileges:true", "--entrypoint", "node", target, "-e", app.IMAGE_FILES_CHECK],
                                      cwd=ROOT, check=check, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            user = run(["docker", "image", "inspect", "--format", "{{.Config.User}}", image], stdout=subprocess.PIPE, text=True).stdout.strip()
            if user in {"", "0", "root"}:
                raise RuntimeError("Runtime image must remain non-root")
            print(probe(image).stdout.strip(), flush=True)
            # Prove the exact same pre-migration probe rejects a root-only fonts directory.
            negative = f"FROM {image}\nUSER root\nRUN chmod 700 /app/public/fonts\nUSER nextjs\n"
            run(["docker", "build", "--network=none", "--tag", broken, "-"], input=negative, text=True)
            failure = probe(broken, check=False)
            if failure.returncode == 0 or "EACCES" not in failure.stderr:
                raise RuntimeError("The permission probe did not detect the synthetic fonts regression")
            print("PASS: root-owned 0700/0600 source assets become readable without runtime root/write access", flush=True)
            print("PASS: an unreadable fonts image is rejected by the pre-migration probe", flush=True)
    finally:
        # Remove only the unique throwaway image tags created by this run. Never prune.
        for target in [broken, image]:
            subprocess.run(["docker", "image", "rm", target], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)


if __name__ == "__main__":
    main()
