import { createHmac } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/auth/errors";
import { getAuthenticationSecret } from "./environment";

export type RateLimitPolicy = { limit: number; windowMs: number; blockMs?: number };

function identifierHash(scope: string, identifier: string) {
  return createHmac("sha256", getAuthenticationSecret()).update(`${scope}:${identifier}`).digest("hex");
}

export function requestIdentifier(request: Request, account = "anonymous") {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const address = forwarded || request.headers.get("x-real-ip")?.trim() || "local";
  return `${address}:${account.toLowerCase()}`;
}

export async function assertRateLimit(scope: string, identifier: string) {
  const bucket = await prisma.securityRateLimit.findUnique({ where: { scope_identifierHash: { scope, identifierHash: identifierHash(scope, identifier) } } });
  if (bucket?.blockedUntil && bucket.blockedUntil > new Date()) throw new HttpError("Too many attempts. Please wait and try again.", 429);
}

export async function recordRateLimitFailure(scope: string, identifier: string, policy: RateLimitPolicy) {
  const now = new Date();
  const hash = identifierHash(scope, identifier);
  await prisma.$transaction(async (tx) => {
    const current = await tx.securityRateLimit.findUnique({ where: { scope_identifierHash: { scope, identifierHash: hash } } });
    const expired = !current || current.windowStartedAt.getTime() + policy.windowMs <= now.getTime();
    const attempts = expired ? 1 : current.attempts + 1;
    const blockedUntil = attempts >= policy.limit ? new Date(now.getTime() + (policy.blockMs ?? policy.windowMs)) : null;
    await tx.securityRateLimit.upsert({
      where: { scope_identifierHash: { scope, identifierHash: hash } },
      create: { scope, identifierHash: hash, attempts, windowStartedAt: now, blockedUntil },
      update: { attempts, windowStartedAt: expired ? now : current!.windowStartedAt, blockedUntil },
    });
  });
}

export async function clearRateLimit(scope: string, identifier: string) {
  await prisma.securityRateLimit.delete({ where: { scope_identifierHash: { scope, identifierHash: identifierHash(scope, identifier) } } }).catch(() => undefined);
}

export async function consumeRateLimit(scope: string, identifier: string, policy: RateLimitPolicy) {
  await assertRateLimit(scope, identifier);
  await recordRateLimitFailure(scope, identifier, policy);
}
