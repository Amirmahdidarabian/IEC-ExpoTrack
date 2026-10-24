ALTER TYPE "AuditAction" ADD VALUE 'COMPANY_FOLDER_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'COMPANY_FOLDER_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'COMPANY_FOLDER_DELETED';
ALTER TYPE "AuditAction" ADD VALUE 'COMPANY_FOLDERS_UPDATED';
ALTER TYPE "AuditEntityType" ADD VALUE 'COMPANY_FOLDER';

CREATE TABLE "CompanyFolder" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "color" TEXT NOT NULL DEFAULT 'cyan',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CompanyFolder_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "CompanyFolderMembership" (
    "companyId" TEXT NOT NULL,
    "folderId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CompanyFolderMembership_pkey" PRIMARY KEY ("companyId", "folderId")
);
CREATE UNIQUE INDEX "CompanyFolder_normalizedName_key" ON "CompanyFolder"("normalizedName");
CREATE INDEX "CompanyFolderMembership_folderId_idx" ON "CompanyFolderMembership"("folderId");
ALTER TABLE "CompanyFolderMembership" ADD CONSTRAINT "CompanyFolderMembership_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompanyFolderMembership" ADD CONSTRAINT "CompanyFolderMembership_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "CompanyFolder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
