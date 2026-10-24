#!/usr/bin/env bash
set -euo pipefail

if [ "$(id -u)" != 0 ]; then
  echo 'Run this installer with sudo/root on Ubuntu.' >&2
  exit 1
fi

IEC_INSTALL_SOURCE=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
for IEC_INSTALL_COMMAND in python3 git docker systemd-run systemctl install flock; do
  command -v "$IEC_INSTALL_COMMAND" >/dev/null || {
    echo "Missing dependency: $IEC_INSTALL_COMMAND (install it separately)." >&2
    exit 1
  }
done
python3 -c 'import sys; sys.exit(0 if sys.version_info >= (3, 10) else "Python 3.10 or newer is required.")'

test -d /run/systemd/system || { echo 'This tool requires a running systemd on Ubuntu.' >&2; exit 1; }
test -f /opt/IEC-ExpoTrack/docker-compose.production.yml
test -f /opt/IEC-ExpoTrack/.env
docker compose version >/dev/null

# Syntax-check without running a deployment or generating bytecode in the repository.
python3 -c 'import ast,sys; ast.parse(open(sys.argv[1], encoding="utf-8").read())' "$IEC_INSTALL_SOURCE/iec-deploy.py"

# Never replace the executable while a detached worker is using it.
python3 -c '
from pathlib import Path
import sys
p = Path("/var/backups/iec-expotrack/deployments")
if p.is_symlink():
    sys.exit("Deployment directory must not be a symlink.")
p.mkdir(parents=True, exist_ok=True, mode=0o700)
if p.stat().st_uid != 0 or p.stat().st_mode & 0o077:
    sys.exit("Deployment directory must be root-owned with mode 700.")
'
exec 9>/var/backups/iec-expotrack/deployments/deploy.lock
flock -n 9 || { echo 'A deployment/menu refresh is running. Wait before updating IEC Deploy.' >&2; exit 1; }

install -m 0755 "$IEC_INSTALL_SOURCE/iec-deploy.py" /usr/local/bin/iec-deploy
install -d -m 0755 /usr/local/share/doc/iec-deploy
install -m 0644 "$IEC_INSTALL_SOURCE/DEPLOYER-FA.md" /usr/local/share/doc/iec-deploy/README-FA.md

echo 'Installed IEC Deploy. No application, database, firewall or Nginx change was made.'
echo 'Open the version menu:        sudo iec-deploy'
echo 'List GitHub branches only:    sudo iec-deploy branches'
echo 'Preview a trusted branch:     sudo iec-deploy v0.8'
echo 'View the latest job:          sudo iec-deploy status'
echo 'Follow its log:               sudo iec-deploy logs'
