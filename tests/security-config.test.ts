import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("repository security automation", () => {
  it("uses read-only GitHub permissions and all required CI gates", () => {
    const workflow = readFileSync(".github/workflows/ci.yml", "utf8");
    expect(workflow).toContain("contents: read");
    for (const check of ["npm ci", "prisma validate", "prisma generate", "npm run typecheck", "npm run test", "npm run build", "npm audit --audit-level=high", "gitleaks/gitleaks-action"]) expect(workflow).toContain(check);
  });
  it("runs the local production gate through Windows command shims", () => {
    const script = readFileSync("scripts/prod-check.mjs", "utf8");
    expect(script).toContain('process.env.ComSpec || "cmd.exe"');
    expect(script).toContain('["/d", "/s", "/c", commandLine]');
    expect(script).toContain("if (result.error)");
  });
  it("patches the vulnerable Prisma CLI merge dependency", () => {
    const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as { overrides?: Record<string, string> };
    expect(packageJson.overrides?.["deepmerge-ts"]).toMatch(/^\^8\./);
  });
  it("keeps production app and database services off public host interfaces", () => {
    const compose = readFileSync("docker-compose.production.yml", "utf8");
    expect(compose).toContain('"127.0.0.1:3000:3000"');
    expect(compose).not.toMatch(/^\s*-\s*["']?5432:5432/m);
    expect(compose).toContain("POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?");
    expect(compose).not.toContain("change-me");
    expect(compose).toMatch(/args:\s+HTTPS_ENABLED: ["']true["']/);
  });
  it("builds HTTPS headers into the production image and replaces spoofable proxy headers", () => {
    const dockerfile = readFileSync("Dockerfile", "utf8");
    const nginx = readFileSync("deploy/nginx.conf.example", "utf8");
    expect(dockerfile).toContain("ARG HTTPS_ENABLED=false");
    expect(nginx).toContain("proxy_set_header X-Forwarded-For $remote_addr;");
    expect(nginx).toContain("proxy_set_header X-Forwarded-Host $host;");
    expect(nginx).not.toContain("$proxy_add_x_forwarded_for");
  });
  it("ships the dynamically loaded country and city data in the production image", () => {
    const dockerfile = readFileSync("Dockerfile", "utf8");
    expect(dockerfile).toContain("COPY --from=builder /app/node_modules/@countrystatecity/countries ./node_modules/@countrystatecity/countries");
  });
});
