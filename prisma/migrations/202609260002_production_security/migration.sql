CREATE TABLE "SecurityRateLimit" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "identifierHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "windowStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "blockedUntil" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SecurityRateLimit_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SecurityRateLimit_scope_identifierHash_key" ON "SecurityRateLimit"("scope", "identifierHash");
CREATE INDEX "SecurityRateLimit_updatedAt_idx" ON "SecurityRateLimit"("updatedAt");
