-- Company intelligence, contacts, classifications, participation, notes and import tracking.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
ALTER TYPE "Permission" ADD VALUE 'VIEW_COMPANIES';
ALTER TYPE "Permission" ADD VALUE 'CREATE_COMPANIES';
ALTER TYPE "Permission" ADD VALUE 'UPDATE_COMPANIES';
ALTER TYPE "Permission" ADD VALUE 'DELETE_COMPANIES';
ALTER TYPE "Permission" ADD VALUE 'IMPORT_COMPANIES';

ALTER TYPE "AuditAction" ADD VALUE 'COMPANY_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'COMPANY_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'COMPANY_DELETED';
ALTER TYPE "AuditAction" ADD VALUE 'CONTACT_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'CONTACT_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'CONTACT_DELETED';
ALTER TYPE "AuditAction" ADD VALUE 'COMPANY_EXHIBITION_LINKED';
ALTER TYPE "AuditAction" ADD VALUE 'COMPANY_EXHIBITION_UNLINKED';
ALTER TYPE "AuditAction" ADD VALUE 'COMPANY_CATEGORY_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'COMPANY_TOPIC_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'COMPANY_NOTE_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'COMPANY_NOTE_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'COMPANY_NOTE_DELETED';
ALTER TYPE "AuditAction" ADD VALUE 'COMPANY_IMPORT_STARTED';
ALTER TYPE "AuditAction" ADD VALUE 'COMPANY_IMPORT_COMPLETED';
ALTER TYPE "AuditAction" ADD VALUE 'COMPANY_IMPORT_FAILED';

ALTER TYPE "AuditEntityType" ADD VALUE 'COMPANY';
ALTER TYPE "AuditEntityType" ADD VALUE 'CONTACT';
ALTER TYPE "AuditEntityType" ADD VALUE 'COMPANY_IMPORT';

CREATE TYPE "CompanySocialPlatform" AS ENUM ('LINKEDIN', 'X', 'INSTAGRAM', 'YOUTUBE', 'FACEBOOK', 'TELEGRAM', 'OTHER');
CREATE TYPE "CompanyExhibitionRole" AS ENUM ('EXHIBITOR', 'SPONSOR', 'SPEAKER', 'PARTNER', 'VISITOR', 'OTHER', 'UNKNOWN');
CREATE TYPE "CompanyImportStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

CREATE TABLE "Company" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "normalizedName" TEXT NOT NULL,
  "website" TEXT,
  "domain" TEXT,
  "countryCode" TEXT,
  "country" TEXT,
  "description" TEXT,
  "priorityScore" INTEGER,
  "saved" BOOLEAN NOT NULL DEFAULT false,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Company_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Company_priorityScore_check" CHECK ("priorityScore" IS NULL OR ("priorityScore" >= 0 AND "priorityScore" <= 100))
);

CREATE TABLE "CompanyContact" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "firstName" TEXT,
  "lastName" TEXT,
  "jobTitle" TEXT,
  "department" TEXT,
  "email" TEXT,
  "phone" TEXT,
  "whatsapp" TEXT,
  "linkedinUrl" TEXT,
  "notes" TEXT,
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CompanyContact_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CompanySocialLink" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "platform" "CompanySocialPlatform" NOT NULL,
  "url" TEXT NOT NULL,
  CONSTRAINT "CompanySocialLink_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CompanyCategory" (
  "companyId" TEXT NOT NULL,
  "categoryId" TEXT NOT NULL,
  CONSTRAINT "CompanyCategory_pkey" PRIMARY KEY ("companyId", "categoryId")
);

CREATE TABLE "CompanyTopic" (
  "companyId" TEXT NOT NULL,
  "topicId" TEXT NOT NULL,
  CONSTRAINT "CompanyTopic_pkey" PRIMARY KEY ("companyId", "topicId")
);

CREATE TABLE "CompanyExhibition" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "exhibitionId" TEXT NOT NULL,
  "role" "CompanyExhibitionRole" NOT NULL DEFAULT 'UNKNOWN',
  "hall" TEXT,
  "booth" TEXT,
  "sourceUrl" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CompanyExhibition_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CompanyNote" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CompanyNote_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CompanyImportJob" (
  "id" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "startedById" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "status" "CompanyImportStatus" NOT NULL DEFAULT 'PENDING',
  "totalRows" INTEGER NOT NULL DEFAULT 0,
  "validRows" INTEGER NOT NULL DEFAULT 0,
  "createdCompanies" INTEGER NOT NULL DEFAULT 0,
  "updatedCompanies" INTEGER NOT NULL DEFAULT 0,
  "createdContacts" INTEGER NOT NULL DEFAULT 0,
  "duplicates" INTEGER NOT NULL DEFAULT 0,
  "failedRows" INTEGER NOT NULL DEFAULT 0,
  "errorSummary" JSONB,
  CONSTRAINT "CompanyImportJob_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Company_domain_idx" ON "Company"("domain");
CREATE INDEX "Company_name_idx" ON "Company"("name");
CREATE INDEX "Company_normalizedName_idx" ON "Company"("normalizedName");
CREATE INDEX "Company_name_trgm_idx" ON "Company" USING GIN ("name" gin_trgm_ops);
CREATE INDEX "Company_normalizedName_trgm_idx" ON "Company" USING GIN ("normalizedName" gin_trgm_ops);
CREATE INDEX "Company_domain_trgm_idx" ON "Company" USING GIN ("domain" gin_trgm_ops);
CREATE INDEX "Company_countryCode_idx" ON "Company"("countryCode");
CREATE INDEX "Company_priorityScore_idx" ON "Company"("priorityScore");
CREATE INDEX "Company_createdAt_idx" ON "Company"("createdAt");
CREATE INDEX "Company_updatedAt_idx" ON "Company"("updatedAt");
CREATE INDEX "Company_createdById_idx" ON "Company"("createdById");
CREATE UNIQUE INDEX "CompanyContact_companyId_email_key" ON "CompanyContact"("companyId", "email");
CREATE UNIQUE INDEX "CompanyContact_one_primary_per_company" ON "CompanyContact"("companyId") WHERE "isPrimary" = true;
CREATE INDEX "CompanyContact_companyId_idx" ON "CompanyContact"("companyId");
CREATE INDEX "CompanyContact_email_idx" ON "CompanyContact"("email");
CREATE INDEX "CompanyContact_lastName_firstName_idx" ON "CompanyContact"("lastName", "firstName");
CREATE INDEX "CompanyContact_email_trgm_idx" ON "CompanyContact" USING GIN ("email" gin_trgm_ops);
CREATE INDEX "CompanyContact_firstName_trgm_idx" ON "CompanyContact" USING GIN ("firstName" gin_trgm_ops);
CREATE INDEX "CompanyContact_lastName_trgm_idx" ON "CompanyContact" USING GIN ("lastName" gin_trgm_ops);
CREATE UNIQUE INDEX "CompanySocialLink_companyId_platform_url_key" ON "CompanySocialLink"("companyId", "platform", "url");
CREATE INDEX "CompanySocialLink_companyId_idx" ON "CompanySocialLink"("companyId");
CREATE INDEX "CompanyCategory_categoryId_idx" ON "CompanyCategory"("categoryId");
CREATE INDEX "CompanyTopic_topicId_idx" ON "CompanyTopic"("topicId");
CREATE UNIQUE INDEX "CompanyExhibition_companyId_exhibitionId_key" ON "CompanyExhibition"("companyId", "exhibitionId");
CREATE INDEX "CompanyExhibition_exhibitionId_idx" ON "CompanyExhibition"("exhibitionId");
CREATE INDEX "CompanyExhibition_companyId_createdAt_idx" ON "CompanyExhibition"("companyId", "createdAt");
CREATE INDEX "CompanyNote_companyId_createdAt_idx" ON "CompanyNote"("companyId", "createdAt");
CREATE INDEX "CompanyNote_createdById_idx" ON "CompanyNote"("createdById");
CREATE INDEX "CompanyImportJob_startedAt_idx" ON "CompanyImportJob"("startedAt");
CREATE INDEX "CompanyImportJob_status_idx" ON "CompanyImportJob"("status");
CREATE INDEX "CompanyImportJob_startedById_idx" ON "CompanyImportJob"("startedById");

ALTER TABLE "Company" ADD CONSTRAINT "Company_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CompanyContact" ADD CONSTRAINT "CompanyContact_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompanySocialLink" ADD CONSTRAINT "CompanySocialLink_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompanyCategory" ADD CONSTRAINT "CompanyCategory_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompanyCategory" ADD CONSTRAINT "CompanyCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "IndustryCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CompanyTopic" ADD CONSTRAINT "CompanyTopic_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompanyTopic" ADD CONSTRAINT "CompanyTopic_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CompanyExhibition" ADD CONSTRAINT "CompanyExhibition_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompanyExhibition" ADD CONSTRAINT "CompanyExhibition_exhibitionId_fkey" FOREIGN KEY ("exhibitionId") REFERENCES "Exhibition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CompanyNote" ADD CONSTRAINT "CompanyNote_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompanyNote" ADD CONSTRAINT "CompanyNote_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CompanyImportJob" ADD CONSTRAINT "CompanyImportJob_startedById_fkey" FOREIGN KEY ("startedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
