import { describe, expect, it, vi } from "vitest";
import { requireSameOrigin } from "@/lib/auth/request-security";
import { HttpError, errorResponse } from "@/lib/auth/errors";

describe("request security", () => {
  it("rejects cross-site state-changing requests", () => expect(() => requireSameOrigin(new Request("https://iec.example/api/account", { headers: { origin: "https://evil.example", "sec-fetch-site": "cross-site" } }))).toThrow("Cross-site request rejected"));
  it("accepts matching origins and non-browser requests", () => { expect(() => requireSameOrigin(new Request("https://iec.example/api/account", { headers: { origin: "https://iec.example" } }))).not.toThrow(); expect(() => requireSameOrigin(new Request("https://iec.example/api/account"))).not.toThrow(); });
  it("does not expose unexpected internal errors", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = errorResponse(new Error("passwordHash DATABASE_URL C:\\server\\secret"), "Request failed");
    expect(response.status).toBe(500); expect(await response.json()).toEqual({ error: "Request failed" });
    expect(log).toHaveBeenCalledWith("Request failed", { name: "Error", code: undefined }); log.mockRestore();
  });
  it("preserves intentional safe HTTP errors", async () => {
    const response = errorResponse(new HttpError("Administrator access required.", 403));
    expect(response.status).toBe(403); expect(await response.json()).toEqual({ error: "Administrator access required." });
  });
});
