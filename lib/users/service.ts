import { AuditAction, Permission, Prisma, UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/auth/errors";
import { hashPassword } from "@/lib/auth/password";
import { createUserSchema, resetPasswordSchema, updateUserSchema } from "@/lib/auth/validation";

const safeUserSelect = {
  id: true, username: true, role: true, isActive: true, mustChangePassword: true,
  createdAt: true, updatedAt: true, lastLoginAt: true,
  permissions: { select: { permission: true } },
} satisfies Prisma.UserSelect;

export async function listUsers() {
  return prisma.user.findMany({ select: safeUserSelect, orderBy: { createdAt: "desc" } });
}

function duplicateUsername(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new HttpError("That username is already in use.", 409);
  throw error;
}

type ManagingActor = { id: string; role: UserRole };

export async function createUser(actor: ManagingActor, raw: unknown) {
  const input = createUserSchema.parse(raw);
  if (input.role === UserRole.ADMIN && actor.role !== UserRole.ADMIN) throw new HttpError("Only an administrator can create another administrator.", 403);
  const passwordHash = await hashPassword(input.temporaryPassword);
  try {
    return await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({ data: {
        username: input.username, passwordHash, role: input.role, isActive: input.isActive, mustChangePassword: true,
        permissions: input.role === UserRole.USER ? { create: [...new Set(input.permissions)].map((permission) => ({ permission })) } : undefined,
      }, select: safeUserSelect });
      await tx.auditLog.create({ data: { actorUserId: actor.id, action: "CREATE_USER", entityType: "USER", entityId: user.id, entityLabel: user.username, description: `Created user ${user.username}`, metadata: { role: user.role, isActive: user.isActive } } });
      return user;
    });
  } catch (error) { return duplicateUsername(error); }
}

export async function updateUser(actor: ManagingActor, targetId: string, raw: unknown) {
  const input = updateUserSchema.parse(raw);
  return prisma.$transaction(async (tx) => {
    const before = await tx.user.findUnique({ where: { id: targetId }, select: safeUserSelect });
    if (!before) throw new HttpError("User not found.", 404);
    if ((before.role === UserRole.ADMIN || input.role === UserRole.ADMIN) && actor.role !== UserRole.ADMIN) throw new HttpError("Only an administrator can manage administrator accounts.", 403);
    const disabling = input.isActive === false && before.isActive;
    const removingAdmin = input.role === UserRole.USER && before.role === UserRole.ADMIN;
    if (targetId === actor.id && disabling) throw new HttpError("You cannot disable your own account.", 409);
    if ((disabling || removingAdmin) && before.role === UserRole.ADMIN) {
      const activeAdmins = await tx.user.count({ where: { role: UserRole.ADMIN, isActive: true } });
      if (activeAdmins <= 1) throw new HttpError("The final active administrator cannot be disabled or demoted.", 409);
    }
    try {
      const user = await tx.user.update({ where: { id: targetId }, data: {
        username: input.username,
        role: input.role,
        isActive: input.isActive,
        permissions: input.permissions ? { deleteMany: {}, create: (input.role ?? before.role) === UserRole.ADMIN ? [] : [...new Set(input.permissions)].map((permission) => ({ permission })) } : undefined,
        sessions: input.isActive === false ? { deleteMany: {} } : undefined,
      }, select: safeUserSelect });
      const entries: { action: AuditAction; description: string; metadata?: Prisma.InputJsonValue }[] = [];
      if (input.permissions) entries.push({ action: "CHANGE_USER_PERMISSIONS", description: `Changed permissions for ${user.username}`, metadata: { permissions: input.permissions } });
      if (disabling) entries.push({ action: "DISABLE_USER", description: `Disabled user ${user.username}` });
      else if (input.isActive === true && !before.isActive) entries.push({ action: "ENABLE_USER", description: `Enabled user ${user.username}` });
      if (input.username && input.username !== before.username) entries.push({ action: "CHANGE_USERNAME", description: `Changed username from ${before.username} to ${user.username}` });
      if (!entries.length || (input.role && input.role !== before.role)) entries.push({ action: "UPDATE_USER", description: `Updated user ${user.username}`, metadata: input.role ? { role: input.role } : undefined });
      await tx.auditLog.createMany({ data: entries.map((entry) => ({ actorUserId: actor.id, entityType: "USER", entityId: user.id, entityLabel: user.username, ...entry })) });
      return user;
    } catch (error) { return duplicateUsername(error); }
  });
}

export async function resetUserPassword(actor: ManagingActor, targetId: string, raw: unknown) {
  const { temporaryPassword } = resetPasswordSchema.parse(raw);
  const passwordHash = await hashPassword(temporaryPassword);
  return prisma.$transaction(async (tx) => {
    const target = await tx.user.findUnique({ where: { id: targetId }, select: { role: true } });
    if (!target) throw new HttpError("User not found.", 404);
    if (target.role === UserRole.ADMIN && actor.role !== UserRole.ADMIN) throw new HttpError("Only an administrator can reset an administrator password.", 403);
    const user = await tx.user.update({ where: { id: targetId }, data: { passwordHash, mustChangePassword: true, sessions: { deleteMany: {} } }, select: { id: true, username: true } });
    await tx.auditLog.create({ data: { actorUserId: actor.id, action: "RESET_USER_PASSWORD", entityType: "USER", entityId: user.id, entityLabel: user.username, description: `Reset password for ${user.username}` } });
    return user;
  });
}

export const permissionValues = Object.values(Permission);
