import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/auth/errors";
import { getAuthenticationSecret } from "./environment";

export type RateLimitPolicy = { limit: number; windowMs: number; blockMs?: number };

const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const rateLimitState = globalThis as typeof globalThis & { iecRateLimitCleanupAt?: number };

function identifierHash(scope: string, identifier: string) {
  return createHmac("sha256", getAuthenticationSecret()).update(`${scope}:${identifier}`).digest("hex");
}

export function requestIdentifier(request: Request, account = "anonymous") {
  // Production is loopback-only, so these headers come from our reverse proxy.
  // Prefer X-Real-IP because nginx always overwrites it; an incoming
  // X-Forwarded-For value may otherwise be attacker-controlled.
  const real = request.headers.get("x-real-ip")?.trim();
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const address = real && isIP(real) ? real : forwarded && isIP(forwarded) ? forwarded : "local";
  return `${address}:${account.toLowerCase()}`;
}

async function cleanupExpiredBuckets(now: Date) {
  if ((rateLimitState.iecRateLimitCleanupAt ?? 0) > now.getTime()) return;
  rateLimitState.iecRateLimitCleanupAt = now.getTime() + CLEANUP_INTERVAL_MS;
  await prisma.securityRateLimit.deleteMany({ where: { updatedAt: { lt: new Date(now.getTime() - RETENTION_MS) } } }).catch(() => undefined);
}

export async function assertRateLimit(scope: string, identifier: string) {
  const bucket = await prisma.securityRateLimit.findUnique({ where: { scope_identifierHash: { scope, identifierHash: identifierHash(scope, identifier) } } });
  if (bucket?.blockedUntil && bucket.blockedUntil > new Date()) throw new HttpError("Too many attempts. Please wait and try again.", 429);
}

export async function recordRateLimitFailure(scope: string, identifier: string, policy: RateLimitPolicy) {
  const now = new Date();
  const hash = identifierHash(scope, identifier);
  await cleanupExpiredBuckets(now);
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
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
      }, { isolationLevel: "Serializable" });
      return;
    } catch (error) {
      const retryable = Boolean(error && typeof error === "object" && "code" in error && error.code === "P2034");
      if (!retryable || attempt === 2) throw error;
    }
  }
}

export async function clearRateLimit(scope: string, identifier: string) {
  await prisma.securityRateLimit.delete({ where: { scope_identifierHash: { scope, identifierHash: identifierHash(scope, identifier) } } }).catch(() => undefined);
}

export async function consumeRateLimit(scope: string, identifier: string, policy: RateLimitPolicy) {
  await assertRateLimit(scope, identifier);
  await recordRateLimitFailure(scope, identifier, policy);
}
