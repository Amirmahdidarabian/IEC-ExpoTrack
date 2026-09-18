CREATE TABLE "Exhibition" (
  "id" TEXT NOT NULL, "slug" TEXT NOT NULL, "name" TEXT NOT NULL, "tagline" TEXT NOT NULL DEFAULT '',
  "industry" TEXT NOT NULL DEFAULT 'Energy', "eventType" TEXT NOT NULL DEFAULT 'International Exhibition',
  "country" TEXT NOT NULL, "city" TEXT NOT NULL DEFAULT '', "venue" TEXT NOT NULL DEFAULT '', "address" TEXT NOT NULL DEFAULT '',
  "startDate" TIMESTAMP(3) NOT NULL, "endDate" TIMESTAMP(3), "timezone" TEXT NOT NULL DEFAULT 'UTC',
  "organizer" TEXT NOT NULL DEFAULT '', "website" TEXT NOT NULL DEFAULT '', "description" TEXT NOT NULL DEFAULT '',
  "aiReport" TEXT NOT NULL DEFAULT '', "topics" JSONB NOT NULL, "saved" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Exhibition_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Source" (
  "id" TEXT NOT NULL, "label" TEXT NOT NULL, "url" TEXT NOT NULL, "lastChecked" TIMESTAMP(3) NOT NULL,
  "priority" INTEGER NOT NULL DEFAULT 5, "exhibitionId" TEXT NOT NULL, CONSTRAINT "Source_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Exhibition_slug_key" ON "Exhibition"("slug");
CREATE INDEX "Exhibition_startDate_idx" ON "Exhibition"("startDate");
CREATE INDEX "Exhibition_country_idx" ON "Exhibition"("country");
CREATE INDEX "Exhibition_industry_idx" ON "Exhibition"("industry");
CREATE INDEX "Source_exhibitionId_idx" ON "Source"("exhibitionId");
ALTER TABLE "Source" ADD CONSTRAINT "Source_exhibitionId_fkey" FOREIGN KEY ("exhibitionId") REFERENCES "Exhibition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
