import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const before = { id: "user-2", username: "amir", role: "USER", isActive: true, mustChangePassword: false, createdAt: new Date(), updatedAt: new Date(), lastLoginAt: null, permissions: [{ permission: "VIEW_EXHIBITIONS" }] };
  const tx = {
    user: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), count: vi.fn() },
    auditLog: { create: vi.fn(), createMany: vi.fn() },
  };
  return { before, tx, transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)) };
});

vi.mock("@/lib/prisma", () => ({ prisma: { $transaction: mocks.transaction, user: { findMany: vi.fn() } } }));
vi.mock("@/lib/auth/password", () => ({ hashPassword: vi.fn(() => Promise.resolve("secure-hash")) }));

import { UserRole } from "@prisma/client";
import { createUser, resetUserPassword, updateUser } from "@/lib/users/service";

const admin = { id: "admin-1", role: UserRole.ADMIN };

describe("user lifecycle service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.tx.user.findUnique.mockResolvedValue(mocks.before);
    mocks.tx.user.count.mockResolvedValue(2);
    mocks.tx.user.create.mockResolvedValue(mocks.before);
    mocks.tx.user.update.mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve({ ...mocks.before, ...data }));
  });
  it("creates users with a hash, forced password change and audit record in one transaction", async () => {
    await createUser(admin, { username: "amir", temporaryPassword: "Temporary2026!", role: "USER", isActive: true, permissions: ["VIEW_EXHIBITIONS"] });
    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(mocks.tx.user.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ passwordHash: "secure-hash", mustChangePassword: true }) }));
    expect(mocks.tx.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: "CREATE_USER" }) });
  });
  it("disables users, revokes sessions and audits the lifecycle action", async () => {
    await updateUser(admin, "user-2", { isActive: false });
    expect(mocks.tx.user.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ isActive: false, sessions: { deleteMany: {} } }) }));
    expect(mocks.tx.auditLog.createMany).toHaveBeenCalledWith({ data: expect.arrayContaining([expect.objectContaining({ action: "DISABLE_USER" })]) });
  });
  it("enables users and audits permission changes", async () => {
    mocks.tx.user.findUnique.mockResolvedValue({ ...mocks.before, isActive: false });
    await updateUser(admin, "user-2", { isActive: true, permissions: ["VIEW_EXHIBITIONS", "UPDATE_EXHIBITIONS"] });
    const audit = mocks.tx.auditLog.createMany.mock.calls[0][0].data;
    expect(audit).toEqual(expect.arrayContaining([expect.objectContaining({ action: "ENABLE_USER" }), expect.objectContaining({ action: "CHANGE_USER_PERMISSIONS" })]));
  });
  it("resets passwords without logging credentials and invalidates sessions", async () => {
    await resetUserPassword(admin, "user-2", { temporaryPassword: "Replacement2026!" });
    expect(mocks.tx.user.update).toHaveBeenCalledWith(expect.objectContaining({ data: { passwordHash: "secure-hash", mustChangePassword: true, sessions: { deleteMany: {} } } }));
    const audit = mocks.tx.auditLog.create.mock.calls[0][0].data;
    expect(audit.action).toBe("RESET_USER_PASSWORD"); expect(JSON.stringify(audit)).not.toContain("Replacement2026!");
  });
  it("prevents disabling the final active administrator", async () => {
    mocks.tx.user.findUnique.mockResolvedValue({ ...mocks.before, role: "ADMIN" }); mocks.tx.user.count.mockResolvedValue(1);
    await expect(updateUser(admin, "user-2", { isActive: false })).rejects.toThrow("final active administrator");
    expect(mocks.tx.user.update).not.toHaveBeenCalled();
  });
});
