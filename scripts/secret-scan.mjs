import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

function run(command, args) { return spawnSync(command, args, { stdio: "inherit", shell: false }); }
const local = join(process.cwd(), ".tools", process.platform === "win32" ? "gitleaks.exe" : "gitleaks");
const direct = spawnSync(process.platform === "win32" ? "where.exe" : "which", ["gitleaks"], { stdio: "ignore", shell: false });
let result;
if (existsSync(local)) {
  result = run(local, ["git", "--redact", "--no-banner", "--config", ".gitleaks.toml"]);
} else if (direct.status === 0) {
  result = run("gitleaks", ["git", "--redact", "--no-banner", "--config", ".gitleaks.toml"]);
} else {
  const mount = `${process.cwd()}:/repo`;
  result = run("docker", ["run", "--rm", "-v", mount, "-w", "/repo", "ghcr.io/gitleaks/gitleaks:v8.28.0", "git", "--redact", "--no-banner", "--config", ".gitleaks.toml"]);
}
if (result.error) console.error("Secret scan could not start. Install gitleaks or start Docker Desktop.");
process.exitCode = result.status === 0 ? 0 : 1;
