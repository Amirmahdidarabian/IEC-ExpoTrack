import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const securityRateLimit = { findUnique: vi.fn(), upsert: vi.fn(), delete: vi.fn(), deleteMany: vi.fn() };
  return { securityRateLimit, transaction: vi.fn(async (callback: (tx: { securityRateLimit: typeof securityRateLimit }) => unknown) => callback({ securityRateLimit })) };
});

vi.mock("@/lib/prisma", () => ({ prisma: { securityRateLimit: mocks.securityRateLimit, $transaction: mocks.transaction } }));

import { assertRateLimit, clearRateLimit, recordRateLimitFailure, requestIdentifier } from "@/lib/security/rate-limit";

describe("persistent rate limiting", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.securityRateLimit.findUnique.mockResolvedValue(null); mocks.securityRateLimit.upsert.mockResolvedValue({}); mocks.securityRateLimit.delete.mockResolvedValue({}); mocks.securityRateLimit.deleteMany.mockResolvedValue({ count: 0 }); });

  it("prefers the proxy-overwritten real IP over a spoofed forwarding chain", () => {
    const request = new Request("https://iec.example", { headers: { "x-real-ip": "198.51.100.8", "x-forwarded-for": "203.0.113.99" } });
    expect(requestIdentifier(request, "Sara")).toBe("198.51.100.8:sara");
  });

  it("stores only a one-way identifier and starts a temporary bucket", async () => {
    await recordRateLimitFailure("login", "203.0.113.4:sara", { limit: 5, windowMs: 60_000 });
    const create = mocks.securityRateLimit.upsert.mock.calls[0][0].create;
    expect(create.identifierHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(create)).not.toContain("203.0.113.4");
    expect(create.attempts).toBe(1);
  });

  it("rejects requests only while the temporary block is active", async () => {
    mocks.securityRateLimit.findUnique.mockResolvedValue({ blockedUntil: new Date(Date.now() + 60_000) });
    await expect(assertRateLimit("login", "client:user")).rejects.toMatchObject({ status: 429 });
    mocks.securityRateLimit.findUnique.mockResolvedValue({ blockedUntil: new Date(Date.now() - 1) });
    await expect(assertRateLimit("login", "client:user")).resolves.toBeUndefined();
  });

  it("clears a successful login bucket without exposing identifiers", async () => {
    await clearRateLimit("login", "client:user");
    expect(mocks.securityRateLimit.delete).toHaveBeenCalledWith({ where: { scope_identifierHash: { scope: "login", identifierHash: expect.stringMatching(/^[a-f0-9]{64}$/) } } });
  });
});
