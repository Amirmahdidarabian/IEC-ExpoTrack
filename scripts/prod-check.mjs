import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { readinessResult } from "./readiness-result.mjs";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const codeOnly = process.argv.includes("--code-only");
const envIndex = process.argv.indexOf("--env-file");
const envFile = envIndex === -1 ? undefined : process.argv[envIndex + 1];
if (envIndex !== -1 && (!envFile || envFile.startsWith("--"))) throw new Error("Provide a path after --env-file.");
if (codeOnly && envFile) throw new Error("--env-file is only applicable to the full production check.");
const checks = [
  ["Prisma schema", npx, ["prisma", "validate"]],
  ["Prisma client", npx, ["prisma", "generate"]],
  ["Lint", npm, ["run", "lint"]],
  ["TypeScript", npm, ["run", "typecheck"]],
  ["Tests", npm, ["run", "test"]],
  ["Production build", npm, ["run", "build"]],
  ["Dependency audit", npm, ["audit", "--audit-level=high", "--registry=https://registry.npmjs.org"]],
  ["Secret scan", npm, ["run", "security:scan"]],
  ...(!codeOnly ? [["Required environment configuration", "node", ["scripts/validate-production-env.mjs", ...(envFile ? ["--env-file", envFile] : [])]]] : []),
];
const results = [];
console.log(codeOnly ? "\nIEC Release Code Check (server environment is not checked)\n" : "\nIEC Production Readiness\n");

function run(command, args) {
  if (command === "node") return spawnSync(process.execPath, args, { stdio: "inherit", shell: false, env: process.env });
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
const { failures, report, filename, label } = readinessResult(results, codeOnly);
writeFileSync(filename, `${JSON.stringify(report, null, 2)}\n`);
console.log(`RESULT: ${label}`);
if (failures.length) console.log(`${failures.length} issue${failures.length === 1 ? "" : "s"} require attention.`);
process.exitCode = failures.length ? 1 : 0;
