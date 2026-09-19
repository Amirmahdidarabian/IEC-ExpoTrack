import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: null as null | { id: string; username: string; passwordHash: string; isActive: boolean; mustChangePassword: boolean },
  createSession: vi.fn(), ensureInitialAdmin: vi.fn(), verifyPassword: vi.fn(), transaction: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: {
  user: { findUnique: vi.fn(() => mocks.user), update: vi.fn(() => Promise.resolve({})) },
  auditLog: { create: vi.fn(() => Promise.resolve({})) }, $transaction: mocks.transaction,
} }));
vi.mock("@/lib/auth/session", () => ({ createSession: mocks.createSession, ensureInitialAdmin: mocks.ensureInitialAdmin }));
vi.mock("@/lib/auth/password", () => ({ verifyPassword: mocks.verifyPassword }));

import { POST } from "@/app/api/auth/login/route";

function login(username = "sara", password = "StrongPassword2026!") {
  return POST(new NextRequest("http://localhost/api/auth/login", { method: "POST", body: JSON.stringify({ username, password }), headers: { "content-type": "application/json" } }));
}

describe("login endpoint", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.transaction.mockResolvedValue([]); mocks.verifyPassword.mockResolvedValue(true); mocks.user = { id: "user-1", username: "sara", passwordHash: "hash", isActive: true, mustChangePassword: false }; });
  it("creates a session and audit transaction for valid credentials", async () => {
    const response = await login(); expect(response.status).toBe(200); expect(mocks.transaction).toHaveBeenCalledOnce(); expect(mocks.createSession).toHaveBeenCalledWith("user-1");
  });
  it("rejects invalid credentials", async () => {
    mocks.verifyPassword.mockResolvedValue(false); const response = await login(); expect(response.status).toBe(401); expect(mocks.createSession).not.toHaveBeenCalled();
  });
  it("rejects disabled users even with a matching password", async () => {
    mocks.user = { ...mocks.user!, isActive: false }; const response = await login(); expect(response.status).toBe(401); expect(mocks.createSession).not.toHaveBeenCalled();
  });
  it("directs first-login users to change their password", async () => {
    mocks.user = { ...mocks.user!, mustChangePassword: true }; const response = await login(); await expect(response.json()).resolves.toMatchObject({ mustChangePassword: true });
  });
});
