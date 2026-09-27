import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const checks = [
  ["Prisma schema", npx, ["prisma", "validate"]],
  ["Prisma client", npx, ["prisma", "generate"]],
  ["TypeScript", npm, ["run", "typecheck"]],
  ["Tests", npm, ["run", "test"]],
  ["Production build", npm, ["run", "build"]],
  ["Dependency audit", npm, ["audit", "--audit-level=high"]],
  ["Secret scan", npm, ["run", "security:scan"]],
  ["Required environment configuration", "node", ["scripts/validate-production-env.mjs"]],
];
const results = [];
console.log("\nIEC Production Readiness\n");

function run(command, args) {
  if (process.platform !== "win32") return spawnSync(command, args, { stdio: "inherit", shell: false, env: process.env });
  // Windows cannot launch npm.cmd/npx.cmd directly. These values are fixed
  // repository constants; none are derived from users or the environment.
  const commandLine = [command, ...args].join(" ");
  return spawnSync(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", commandLine], { stdio: "inherit", shell: false, env: process.env });
}

for (const [label, command, args] of checks) {
  const result = run(command, args);
  const passed = result.status === 0;
  if (result.error) console.error(`Unable to start ${label}: ${result.error.message}`);
  results.push({ label, passed });
  console.log(`${passed ? "PASS" : "FAIL"}  ${label}\n`);
}
writeFileSync(".security-check.json", `${JSON.stringify({ completedAt: new Date().toISOString(), checks: results }, null, 2)}\n`);
const failures = results.filter((result) => !result.passed);
console.log(`RESULT: ${failures.length ? "NOT READY" : "READY"}`);
if (failures.length) console.log(`${failures.length} issue${failures.length === 1 ? "" : "s"} require attention.`);
process.exitCode = failures.length ? 1 : 0;
