import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createSession, ensureInitialAdmin, requestUsesHttps } from "@/lib/auth/session";
import { verifyPassword } from "@/lib/auth/password";
import { loginSchema } from "@/lib/auth/validation";
import { hashPassword } from "@/lib/auth/password";
import { requireSameOrigin } from "@/lib/auth/request-security";
import { assertRateLimit, clearRateLimit, recordRateLimitFailure, requestIdentifier } from "@/lib/security/rate-limit";
import { errorResponse } from "@/lib/auth/errors";

const LOGIN_POLICY = { limit: 5, windowMs: 15 * 60 * 1000, blockMs: 15 * 60 * 1000 };
const LOGIN_ACCOUNT_POLICY = { limit: 15, windowMs: 15 * 60 * 1000, blockMs: 15 * 60 * 1000 };
const LOGIN_NETWORK_POLICY = { limit: 30, windowMs: 15 * 60 * 1000, blockMs: 15 * 60 * 1000 };
const dummyPasswordHash = hashPassword("InvalidLoginPassword2026!");

export async function POST(request: NextRequest) {
  try {
    requireSameOrigin(request);
    await ensureInitialAdmin();
    const input = loginSchema.parse(await request.json());
    const rateKey = requestIdentifier(request, input.username);
    const accountKey = input.username.toLowerCase();
    const networkKey = requestIdentifier(request);
    await Promise.all([
      assertRateLimit("login", rateKey),
      assertRateLimit("login-account", accountKey),
      assertRateLimit("login-network", networkKey),
    ]);
    const user = await prisma.user.findUnique({ where: { username: input.username }, select: { id: true, username: true, passwordHash: true, isActive: true, mustChangePassword: true } });
    const validPassword = await verifyPassword(input.password, user?.passwordHash ?? await dummyPasswordHash);
    const valid = Boolean(user?.isActive && validPassword);
    if (!valid || !user) {
      await Promise.all([
        recordRateLimitFailure("login", rateKey, LOGIN_POLICY),
        recordRateLimitFailure("login-account", accountKey, LOGIN_ACCOUNT_POLICY),
        recordRateLimitFailure("login-network", networkKey, LOGIN_NETWORK_POLICY),
      ]);
      return NextResponse.json({ error: "Invalid username or password." }, { status: 401 });
    }
    await Promise.all([clearRateLimit("login", rateKey), clearRateLimit("login-account", accountKey)]);
    await prisma.$transaction([
      prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }),
      prisma.auditLog.create({ data: { actorUserId: user.id, action: "LOGIN", entityType: "AUTH", entityId: user.id, entityLabel: user.username, description: `${user.username} signed in` } }),
    ]);
    await createSession(user.id, process.env.NODE_ENV === "production" || requestUsesHttps(request));
    return NextResponse.json({ ok: true, mustChangePassword: user.mustChangePassword });
  } catch (error) { return errorResponse(error, "Unable to sign in."); }
}
