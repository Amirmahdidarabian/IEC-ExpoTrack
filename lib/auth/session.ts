import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Permission, Prisma, UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { HttpError } from "./errors";
import { hasPermission, type AuthorizedUser } from "./permissions";
import { hashPassword } from "./password";
import { passwordSchema, usernameSchema } from "./validation";

export const SESSION_COOKIE = "iec_session";
const SESSION_DAYS = 7;

const userSelect = {
  id: true, username: true, role: true, isActive: true, mustChangePassword: true,
  permissions: { select: { permission: true } },
} satisfies Prisma.UserSelect;

function tokenHash(value: string) { return createHash("sha256").update(value).digest("hex"); }

function safeUser(user: { id: string; username: string; role: UserRole; isActive: boolean; mustChangePassword: boolean; permissions: { permission: Permission }[] }): AuthorizedUser {
  return { ...user, permissions: user.permissions.map((entry) => entry.permission) };
}

export async function ensureInitialAdmin() {
  const usernameResult = usernameSchema.safeParse(process.env.INITIAL_ADMIN_USERNAME);
  const passwordResult = passwordSchema.safeParse(process.env.INITIAL_ADMIN_PASSWORD);
  if (!usernameResult.success || !passwordResult.success) return;
  const username = usernameResult.data; const password = passwordResult.data;
  const existing = await prisma.user.findUnique({ where: { username }, select: { id: true } });
  if (existing) return;
  const passwordHash = await hashPassword(password);
  try {
    await prisma.user.create({ data: { username, passwordHash, role: UserRole.ADMIN, mustChangePassword: true } });
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
  }
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await prisma.session.create({ data: { userId, tokenHash: tokenHash(token), expiresAt } });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", expires: expiresAt });
}

export async function getCurrentUser(): Promise<AuthorizedUser | null> {
  const value = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!value) return null;
  const session = await prisma.session.findUnique({ where: { tokenHash: tokenHash(value) }, select: { id: true, expiresAt: true, user: { select: userSelect } } });
  if (!session || session.expiresAt <= new Date() || !session.user.isActive) {
    if (session) await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }
  return safeUser(session.user);
}

export async function requireAuthenticatedUser(options: { permission?: Permission; allowPasswordChange?: boolean } = {}) {
  const user = await getCurrentUser();
  if (!user) throw new HttpError("Authentication required.", 401);
  if (user.mustChangePassword && !options.allowPasswordChange) throw new HttpError("Password change required.", 403);
  if (options.permission && !hasPermission(user, options.permission)) throw new HttpError("You do not have permission to perform this action.", 403);
  return user;
}

export async function requirePageUser(permission?: Permission, allowPasswordChange = false) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword && !allowPasswordChange) redirect("/settings/account?required=1");
  if (permission && !hasPermission(user, permission)) redirect("/exhibitions?forbidden=1");
  return user;
}

export async function clearSession() {
  const jar = await cookies();
  const value = jar.get(SESSION_COOKIE)?.value;
  jar.delete(SESSION_COOKIE);
  if (!value) return null;
  const session = await prisma.session.findUnique({ where: { tokenHash: tokenHash(value) }, select: { id: true, userId: true, user: { select: { username: true } } } });
  if (!session) return null;
  await prisma.$transaction([
    prisma.session.delete({ where: { id: session.id } }),
    prisma.auditLog.create({ data: { actorUserId: session.userId, action: "LOGOUT", entityType: "AUTH", entityId: session.userId, entityLabel: session.user.username, description: `${session.user.username} signed out` } }),
  ]);
  return session.userId;
}
