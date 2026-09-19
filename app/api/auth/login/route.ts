import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createSession, ensureInitialAdmin } from "@/lib/auth/session";
import { verifyPassword } from "@/lib/auth/password";
import { loginSchema } from "@/lib/auth/validation";

const attempts = new Map<string, { count: number; resetAt: number }>();
const WINDOW = 15 * 60 * 1000;

export async function POST(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const key = `${forwarded ?? "local"}:${Date.now()}`;
  try {
    await ensureInitialAdmin();
    const input = loginSchema.parse(await request.json());
    const rateKey = `${forwarded ?? "local"}:${input.username.toLowerCase()}`;
    const current = attempts.get(rateKey);
    if (current && current.resetAt > Date.now() && current.count >= 5) return NextResponse.json({ error: "Too many sign-in attempts. Try again later." }, { status: 429 });
    const user = await prisma.user.findUnique({ where: { username: input.username }, select: { id: true, username: true, passwordHash: true, isActive: true, mustChangePassword: true } });
    const valid = Boolean(user?.isActive && await verifyPassword(input.password, user.passwordHash));
    if (!valid || !user) {
      const state = current && current.resetAt > Date.now() ? current : { count: 0, resetAt: Date.now() + WINDOW };
      attempts.set(rateKey, { ...state, count: state.count + 1 });
      return NextResponse.json({ error: "Invalid username or password." }, { status: 401 });
    }
    attempts.delete(rateKey);
    await prisma.$transaction([
      prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }),
      prisma.auditLog.create({ data: { actorUserId: user.id, action: "LOGIN", entityType: "AUTH", entityId: user.id, entityLabel: user.username, description: `${user.username} signed in` } }),
    ]);
    await createSession(user.id);
    return NextResponse.json({ ok: true, mustChangePassword: user.mustChangePassword });
  } catch {
    attempts.delete(key);
    return NextResponse.json({ error: "Unable to sign in." }, { status: 400 });
  }
}
