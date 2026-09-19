import { Permission, UserRole } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { effectivePermissions, hasPermission } from "@/lib/auth/permissions";
import { createUserSchema, ownAccountSchema, passwordSchema, usernameSchema } from "@/lib/auth/validation";

describe("password security", () => {
  it("hashes and verifies a valid password without retaining plaintext", async () => {
    const password = "StrongPassword2026!"; const hash = await hashPassword(password);
    expect(hash).not.toContain(password); expect(hash.startsWith("scrypt$")).toBe(true);
    await expect(verifyPassword(password, hash)).resolves.toBe(true);
    await expect(verifyPassword("WrongPassword2026!", hash)).resolves.toBe(false);
  });
  it("enforces the account password policy", () => {
    expect(passwordSchema.safeParse("short").success).toBe(false);
    expect(passwordSchema.safeParse("StrongPassword2026!").success).toBe(true);
  });
});

describe("authorization", () => {
  const viewer = { role: UserRole.USER, permissions: [Permission.VIEW_EXHIBITIONS] };
  it("grants only explicitly assigned employee permissions", () => {
    expect(hasPermission(viewer, Permission.VIEW_EXHIBITIONS)).toBe(true);
    expect(hasPermission(viewer, Permission.CREATE_EXHIBITIONS)).toBe(false);
    expect(hasPermission(viewer, Permission.UPDATE_EXHIBITIONS)).toBe(false);
    expect(hasPermission(viewer, Permission.DELETE_EXHIBITIONS)).toBe(false);
  });
  it("gives administrators every effective permission", () => {
    const admin = { role: UserRole.ADMIN, permissions: [] };
    expect(effectivePermissions(admin)).toEqual(expect.arrayContaining(Object.values(Permission)));
    expect(Object.values(Permission).every((permission) => hasPermission(admin, permission))).toBe(true);
  });
});

describe("account validation", () => {
  it("rejects unsafe usernames and mismatched password confirmation", () => {
    expect(usernameSchema.safeParse("bad user").success).toBe(false);
    expect(ownAccountSchema.safeParse({ currentPassword: "OldPassword2026!", newPassword: "NewPassword2026!", confirmPassword: "Different2026!" }).success).toBe(false);
  });
  it("validates user creation and relational permission values", () => {
    expect(createUserSchema.safeParse({ username: "sara", temporaryPassword: "Temporary2026!", role: "USER", isActive: true, permissions: ["VIEW_EXHIBITIONS", "UPDATE_EXHIBITIONS"] }).success).toBe(true);
    expect(createUserSchema.safeParse({ username: "sara", temporaryPassword: "Temporary2026!", role: "USER", permissions: ["ROOT_ACCESS"] }).success).toBe(false);
  });
});
