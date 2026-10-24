import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("Ubuntu deployment safety (offline Python standard-library suite)", () => {
  it("validates releases, backup gates, migration failures, rollback and detached dispatch", () => {
    const python = process.platform === "win32" ? "python" : "python3";
    const output = execFileSync(python, ["-B", "-m", "unittest", "discover", "-s", "tests/deploy", "-p", "test_*.py"], {
      encoding: "utf8", timeout: 30000, env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    expect(output).not.toContain("FAILED");
  }, 35000);
});
