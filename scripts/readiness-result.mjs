export function readinessResult(checks, codeOnly, completedAt = new Date().toISOString()) {
  const failures = checks.filter((check) => !check.passed);
  return {
    report: { completedAt, mode: codeOnly ? "code-only" : "production", deploymentReady: !codeOnly && failures.length === 0, checks },
    failures,
    label: failures.length ? "NOT READY" : codeOnly ? "CODE READY — server configuration still requires verification" : "READY",
    filename: codeOnly ? ".release-check.json" : ".security-check.json",
  };
}
