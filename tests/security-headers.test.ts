import { describe, expect, it } from "vitest";
import { buildSecurityHeaders } from "@/lib/security/headers";

describe("security headers", () => {
  it("sets core browser protections and a compatible CSP", () => {
    const headers = Object.fromEntries(buildSecurityHeaders({ production: true, httpsEnabled: true }).map((header) => [header.key, header.value]));
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(headers["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["Permissions-Policy"]).toContain("camera=()");
    expect(headers["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
    expect(headers["Content-Security-Policy"]).not.toContain("unsafe-eval");
  });
  it("only enables HSTS when production HTTPS is explicitly configured", () => {
    expect(buildSecurityHeaders({ production: true, httpsEnabled: false }).some((header) => header.key === "Strict-Transport-Security")).toBe(false);
    expect(buildSecurityHeaders({ production: true, httpsEnabled: true }).some((header) => header.key === "Strict-Transport-Security")).toBe(true);
  });
});
