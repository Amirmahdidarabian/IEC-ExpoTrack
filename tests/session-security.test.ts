import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookie: "session-token",
  session: null as null | { id: string; expiresAt: Date; user: { id: string; username: string; role: "ADMIN" | "USER"; isActive: boolean; mustChangePassword: boolean; permissions: { permission: never }[] } },
  deleteSession: vi.fn(),
}));

vi.mock("next/headers", () => ({ cookies: vi.fn(async () => ({ get: vi.fn(() => mocks.cookie ? { value: mocks.cookie } : undefined), set: vi.fn(), delete: vi.fn() })) }));
vi.mock("@/lib/prisma", () => ({ prisma: {
  session: { findUnique: vi.fn(() => mocks.session), delete: mocks.deleteSession },
  user: { findUnique: vi.fn() },
} }));

import { getCurrentUser } from "@/lib/auth/session";

describe("session security", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.deleteSession.mockResolvedValue({}); mocks.cookie = "session-token"; mocks.session = { id: "session-1", expiresAt: new Date(Date.now() + 60_000), user: { id: "user-1", username: "sara", role: "USER", isActive: true, mustChangePassword: false, permissions: [] } }; });
  it("returns only the authorized safe-user fields", async () => {
    await expect(getCurrentUser()).resolves.toEqual({ id: "user-1", username: "sara", role: "USER", isActive: true, mustChangePassword: false, permissions: [] });
    expect(JSON.stringify(await getCurrentUser())).not.toContain("passwordHash");
  });
  it("rejects and removes disabled-user sessions", async () => {
    mocks.session = { ...mocks.session!, user: { ...mocks.session!.user, isActive: false } };
    await expect(getCurrentUser()).resolves.toBeNull(); expect(mocks.deleteSession).toHaveBeenCalledWith({ where: { id: "session-1" } });
  });
  it("rejects and removes expired sessions", async () => {
    mocks.session = { ...mocks.session!, expiresAt: new Date(Date.now() - 1) };
    await expect(getCurrentUser()).resolves.toBeNull(); expect(mocks.deleteSession).toHaveBeenCalledOnce();
  });
});
