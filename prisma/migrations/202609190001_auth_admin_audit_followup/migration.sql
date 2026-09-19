-- Authentication, granular authorization, immutable audit history and manual email follow-up tracking.
-- All links added to existing exhibition rows are nullable to preserve production data.
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'USER');
CREATE TYPE "Permission" AS ENUM ('VIEW_EXHIBITIONS', 'CREATE_EXHIBITIONS', 'UPDATE_EXHIBITIONS', 'DELETE_EXHIBITIONS', 'VIEW_ADMIN_DASHBOARD', 'MANAGE_USERS', 'VIEW_AUDIT_LOGS');
CREATE TYPE "AuditAction" AS ENUM ('LOGIN', 'LOGOUT', 'CREATE_EXHIBITION', 'UPDATE_EXHIBITION', 'DELETE_EXHIBITION', 'PRE_EVENT_EMAIL_MARKED_SENT', 'PRE_EVENT_EMAIL_MARKED_UNSENT', 'POST_EVENT_EMAIL_MARKED_SENT', 'POST_EVENT_EMAIL_MARKED_UNSENT', 'CREATE_USER', 'UPDATE_USER', 'DISABLE_USER', 'ENABLE_USER', 'CHANGE_USER_PERMISSIONS', 'RESET_USER_PASSWORD', 'CHANGE_OWN_PASSWORD', 'CHANGE_USERNAME');
CREATE TYPE "AuditEntityType" AS ENUM ('EXHIBITION', 'USER', 'AUTH', 'SYSTEM');

CREATE TABLE "User" (
  "id" TEXT NOT NULL,
  "username" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "role" "UserRole" NOT NULL DEFAULT 'USER',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "mustChangePassword" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "lastLoginAt" TIMESTAMP(3),
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UserPermission" (
  "userId" TEXT NOT NULL,
  "permission" "Permission" NOT NULL,
  CONSTRAINT "UserPermission_pkey" PRIMARY KEY ("userId", "permission")
);

CREATE TABLE "Session" (
  "id" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuditLog" (
  "id" TEXT NOT NULL,
  "actorUserId" TEXT,
  "action" "AuditAction" NOT NULL,
  "entityType" "AuditEntityType" NOT NULL,
  "entityId" TEXT,
  "entityLabel" TEXT,
  "description" TEXT NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Exhibition"
  ADD COLUMN "preEventEmailSent" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "preEventEmailSentAt" TIMESTAMP(3),
  ADD COLUMN "preEventEmailSentById" TEXT,
  ADD COLUMN "postEventEmailSent" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "postEventEmailSentAt" TIMESTAMP(3),
  ADD COLUMN "postEventEmailSentById" TEXT,
  ADD COLUMN "createdById" TEXT,
  ADD COLUMN "updatedById" TEXT;

CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
CREATE INDEX "User_isActive_idx" ON "User"("isActive");
CREATE INDEX "UserPermission_permission_idx" ON "UserPermission"("permission");
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");
CREATE INDEX "Session_userId_idx" ON "Session"("userId");
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
CREATE INDEX "AuditLog_actorUserId_idx" ON "AuditLog"("actorUserId");
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");
CREATE INDEX "Exhibition_createdAt_idx" ON "Exhibition"("createdAt");
CREATE INDEX "Exhibition_updatedAt_idx" ON "Exhibition"("updatedAt");
CREATE INDEX "Exhibition_createdById_idx" ON "Exhibition"("createdById");
CREATE INDEX "Exhibition_updatedById_idx" ON "Exhibition"("updatedById");

ALTER TABLE "UserPermission" ADD CONSTRAINT "UserPermission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Exhibition" ADD CONSTRAINT "Exhibition_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Exhibition" ADD CONSTRAINT "Exhibition_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Exhibition" ADD CONSTRAINT "Exhibition_preEventEmailSentById_fkey" FOREIGN KEY ("preEventEmailSentById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Exhibition" ADD CONSTRAINT "Exhibition_postEventEmailSentById_fkey" FOREIGN KEY ("postEventEmailSentById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
