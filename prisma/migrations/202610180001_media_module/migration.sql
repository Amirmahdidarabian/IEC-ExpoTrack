-- CreateEnum
CREATE TYPE "MediaContactMethod" AS ENUM ('EMAIL', 'CONTACT_PAGE', 'WEBSITE_FORM', 'OTHER');

-- CreateEnum
CREATE TYPE "MediaImportStatus" AS ENUM ('PROCESSING', 'COMPLETED', 'FAILED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "Permission" ADD VALUE 'VIEW_MEDIA';
ALTER TYPE "Permission" ADD VALUE 'CREATE_MEDIA';
ALTER TYPE "Permission" ADD VALUE 'UPDATE_MEDIA';
ALTER TYPE "Permission" ADD VALUE 'DELETE_MEDIA';
ALTER TYPE "Permission" ADD VALUE 'IMPORT_MEDIA';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'MEDIA_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'MEDIA_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'MEDIA_DELETED';
ALTER TYPE "AuditAction" ADD VALUE 'MEDIA_CONTACT_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'MEDIA_CONTACT_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'MEDIA_CONTACT_DELETED';
ALTER TYPE "AuditAction" ADD VALUE 'MEDIA_CLASSIFICATION_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'MEDIA_NOTE_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'MEDIA_NOTE_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'MEDIA_NOTE_DELETED';
ALTER TYPE "AuditAction" ADD VALUE 'MEDIA_IMPORT_STARTED';
ALTER TYPE "AuditAction" ADD VALUE 'MEDIA_IMPORT_COMPLETED';
ALTER TYPE "AuditAction" ADD VALUE 'MEDIA_IMPORT_FAILED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditEntityType" ADD VALUE 'MEDIA';
ALTER TYPE "AuditEntityType" ADD VALUE 'MEDIA_CONTACT';
ALTER TYPE "AuditEntityType" ADD VALUE 'MEDIA_IMPORT';

-- CreateTable
CREATE TABLE "MediaOutlet" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "identityKey" TEXT,
    "websiteUrl" TEXT,
    "domain" TEXT,
    "sourceCategoryRaw" TEXT,
    "countryCode" TEXT,
    "countryName" TEXT,
    "publicationScopeRaw" TEXT,
    "description" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MediaOutlet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaContact" (
    "id" TEXT NOT NULL,
    "mediaOutletId" TEXT NOT NULL,
    "name" TEXT,
    "roleLabel" TEXT,
    "department" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "linkedInUrl" TEXT,
    "contactPageUrl" TEXT,
    "contactMethod" "MediaContactMethod" NOT NULL DEFAULT 'OTHER',
    "notes" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,
    "sourceLabelRaw" TEXT,
    "sourceValueRaw" TEXT,
    "sourceSheet" TEXT,
    "sourceRow" INTEGER,
    "importKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MediaContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaSocialLink" (
    "id" TEXT NOT NULL,
    "mediaOutletId" TEXT NOT NULL,
    "platform" "CompanySocialPlatform" NOT NULL,
    "url" TEXT NOT NULL,

    CONSTRAINT "MediaSocialLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaCategory" (
    "mediaOutletId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,

    CONSTRAINT "MediaCategory_pkey" PRIMARY KEY ("mediaOutletId","categoryId")
);

-- CreateTable
CREATE TABLE "MediaTopic" (
    "mediaOutletId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,

    CONSTRAINT "MediaTopic_pkey" PRIMARY KEY ("mediaOutletId","topicId")
);

-- CreateTable
CREATE TABLE "MediaNote" (
    "id" TEXT NOT NULL,
    "mediaOutletId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MediaNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaImportJob" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileHash" TEXT NOT NULL,
    "startedById" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "status" "MediaImportStatus" NOT NULL DEFAULT 'PROCESSING',
    "report" JSONB,

    CONSTRAINT "MediaImportJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaImportSource" (
    "id" TEXT NOT NULL,
    "mediaOutletId" TEXT NOT NULL,
    "importJobId" TEXT NOT NULL,
    "sourceSheet" TEXT NOT NULL,
    "sourceRow" INTEGER NOT NULL,
    "rawValues" JSONB NOT NULL,
    "warnings" JSONB NOT NULL,

    CONSTRAINT "MediaImportSource_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MediaOutlet_identityKey_key" ON "MediaOutlet"("identityKey");

-- CreateIndex
CREATE INDEX "MediaOutlet_normalizedName_idx" ON "MediaOutlet"("normalizedName");

-- CreateIndex
CREATE INDEX "MediaOutlet_domain_idx" ON "MediaOutlet"("domain");

-- CreateIndex
CREATE INDEX "MediaOutlet_countryCode_idx" ON "MediaOutlet"("countryCode");

-- CreateIndex
CREATE INDEX "MediaOutlet_publicationScopeRaw_idx" ON "MediaOutlet"("publicationScopeRaw");

-- CreateIndex
CREATE INDEX "MediaOutlet_sourceCategoryRaw_idx" ON "MediaOutlet"("sourceCategoryRaw");

-- CreateIndex
CREATE INDEX "MediaOutlet_createdAt_idx" ON "MediaOutlet"("createdAt");

-- CreateIndex
CREATE INDEX "MediaOutlet_updatedAt_idx" ON "MediaOutlet"("updatedAt");

-- CreateIndex
CREATE INDEX "MediaContact_mediaOutletId_position_idx" ON "MediaContact"("mediaOutletId", "position");

-- CreateIndex
CREATE INDEX "MediaContact_email_idx" ON "MediaContact"("email");

-- CreateIndex
CREATE UNIQUE INDEX "MediaContact_mediaOutletId_importKey_key" ON "MediaContact"("mediaOutletId", "importKey");

-- CreateIndex
CREATE UNIQUE INDEX "MediaSocialLink_mediaOutletId_platform_url_key" ON "MediaSocialLink"("mediaOutletId", "platform", "url");

-- CreateIndex
CREATE INDEX "MediaCategory_categoryId_idx" ON "MediaCategory"("categoryId");

-- CreateIndex
CREATE INDEX "MediaTopic_topicId_idx" ON "MediaTopic"("topicId");

-- CreateIndex
CREATE INDEX "MediaNote_mediaOutletId_createdAt_idx" ON "MediaNote"("mediaOutletId", "createdAt");

-- CreateIndex
CREATE INDEX "MediaImportJob_fileHash_idx" ON "MediaImportJob"("fileHash");

-- CreateIndex
CREATE INDEX "MediaImportJob_startedAt_idx" ON "MediaImportJob"("startedAt");

-- CreateIndex
CREATE INDEX "MediaImportSource_mediaOutletId_idx" ON "MediaImportSource"("mediaOutletId");

-- CreateIndex
CREATE UNIQUE INDEX "MediaImportSource_importJobId_sourceSheet_sourceRow_key" ON "MediaImportSource"("importJobId", "sourceSheet", "sourceRow");

-- AddForeignKey
ALTER TABLE "MediaOutlet" ADD CONSTRAINT "MediaOutlet_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaContact" ADD CONSTRAINT "MediaContact_mediaOutletId_fkey" FOREIGN KEY ("mediaOutletId") REFERENCES "MediaOutlet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaSocialLink" ADD CONSTRAINT "MediaSocialLink_mediaOutletId_fkey" FOREIGN KEY ("mediaOutletId") REFERENCES "MediaOutlet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaCategory" ADD CONSTRAINT "MediaCategory_mediaOutletId_fkey" FOREIGN KEY ("mediaOutletId") REFERENCES "MediaOutlet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaCategory" ADD CONSTRAINT "MediaCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "IndustryCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaTopic" ADD CONSTRAINT "MediaTopic_mediaOutletId_fkey" FOREIGN KEY ("mediaOutletId") REFERENCES "MediaOutlet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaTopic" ADD CONSTRAINT "MediaTopic_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaNote" ADD CONSTRAINT "MediaNote_mediaOutletId_fkey" FOREIGN KEY ("mediaOutletId") REFERENCES "MediaOutlet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaNote" ADD CONSTRAINT "MediaNote_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaImportJob" ADD CONSTRAINT "MediaImportJob_startedById_fkey" FOREIGN KEY ("startedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaImportSource" ADD CONSTRAINT "MediaImportSource_mediaOutletId_fkey" FOREIGN KEY ("mediaOutletId") REFERENCES "MediaOutlet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaImportSource" ADD CONSTRAINT "MediaImportSource_importJobId_fkey" FOREIGN KEY ("importJobId") REFERENCES "MediaImportJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Enforce at most one primary contact per outlet, including concurrent writes.
CREATE UNIQUE INDEX "MediaContact_single_primary" ON "MediaContact" ("mediaOutletId") WHERE "isPrimary" = true;

