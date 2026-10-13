import { mkdtempSync, writeFileSync, unlinkSync, rmdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
// @ts-expect-error This helper is also used by the Node.js deployment scripts.
import { readinessResult } from "../scripts/readiness-result.mjs";

describe("code and production readiness separation", () => {
  it("never labels a passing code-only check as deployment ready", () => {
    const result = readinessResult([{ label: "Build", passed: true }], true);
    expect(result.report).toMatchObject({ mode: "code-only", deploymentReady: false });
    expect(result.label).toContain("CODE READY");
    expect(result.filename).toBe(".release-check.json");
  });
  it("retains strict production failures and distinct reporting", () => {
    const failed = readinessResult([{ label: "Environment", passed: false }], false);
    expect(failed.report.deploymentReady).toBe(false);
    expect(failed.label).toBe("NOT READY");
    expect(failed.filename).toBe(".security-check.json");
    expect(readinessResult([{ label: "Environment", passed: true }], false).report.deploymentReady).toBe(true);
  });
  it("validates an explicitly selected file instead of inherited development variables", () => {
    const directory = mkdtempSync(join(tmpdir(), "iec-env-check-"));
    const filename = join(directory, "production test.env");
    const password = randomBytes(24).toString("hex");
    const secret = randomBytes(48).toString("hex");
    try {
      writeFileSync(filename, `NODE_ENV=production\nHTTPS_ENABLED=true\nPOSTGRES_PASSWORD=${password}\nAUTH_SECRET=${secret}\nDATABASE_URL=postgresql://iec:${password}@127.0.0.1:5432/iec_test\n`);
      const valid = spawnSync(process.execPath, ["scripts/validate-production-env.mjs", "--env-file", filename], { encoding: "utf8", env: { ...process.env, NODE_ENV: "development", AUTH_SECRET: "bad" } });
      expect(valid.status).toBe(0);
      expect(valid.stdout).not.toContain(secret);
      writeFileSync(filename, "NODE_ENV=development\nHTTPS_ENABLED=false\nPOSTGRES_PASSWORD=bad\nAUTH_SECRET=bad\nDATABASE_URL=invalid\n");
      const invalid = spawnSync(process.execPath, ["scripts/validate-production-env.mjs", "--env-file", filename], { encoding: "utf8", env: { ...process.env, NODE_ENV: "production", AUTH_SECRET: secret, POSTGRES_PASSWORD: password, HTTPS_ENABLED: "true", DATABASE_URL: `postgresql://iec:${password}@127.0.0.1:5432/iec_test` } });
      expect(invalid.status).toBe(1);
      expect(invalid.stdout).toContain("FAIL");
      expect(invalid.stdout).not.toContain(secret);
    } finally { unlinkSync(filename); rmdirSync(directory); }
  });
});
