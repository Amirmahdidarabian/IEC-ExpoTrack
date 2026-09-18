-- Add a stable ISO country code without invalidating existing rows.
ALTER TABLE "Exhibition" ADD COLUMN "countryCode" TEXT;

-- Existing production values remain in Exhibition.industry/topics for compatibility.
-- These normalized entities become the source of truth for all new writes.
CREATE TABLE "IndustryCategory" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "normalizedName" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IndustryCategory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Topic" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "normalizedName" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Topic_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ExhibitionCategory" (
  "exhibitionId" TEXT NOT NULL,
  "categoryId" TEXT NOT NULL,
  CONSTRAINT "ExhibitionCategory_pkey" PRIMARY KEY ("exhibitionId", "categoryId")
);

CREATE TABLE "ExhibitionTopic" (
  "exhibitionId" TEXT NOT NULL,
  "topicId" TEXT NOT NULL,
  CONSTRAINT "ExhibitionTopic_pkey" PRIMARY KEY ("exhibitionId", "topicId")
);

CREATE UNIQUE INDEX "IndustryCategory_normalizedName_key" ON "IndustryCategory"("normalizedName");
CREATE UNIQUE INDEX "IndustryCategory_slug_key" ON "IndustryCategory"("slug");
CREATE UNIQUE INDEX "Topic_normalizedName_key" ON "Topic"("normalizedName");
CREATE UNIQUE INDEX "Topic_slug_key" ON "Topic"("slug");
CREATE INDEX "ExhibitionCategory_categoryId_idx" ON "ExhibitionCategory"("categoryId");
CREATE INDEX "ExhibitionTopic_topicId_idx" ON "ExhibitionTopic"("topicId");

-- Backfill categories from every non-empty legacy industry value.
WITH values_to_copy AS (
  SELECT DISTINCT
    trim("industry") AS name,
    lower(regexp_replace(trim("industry"), '\s+', ' ', 'g')) AS normalized
  FROM "Exhibition"
  WHERE trim(COALESCE("industry", '')) <> ''
)
INSERT INTO "IndustryCategory" ("id", "name", "normalizedName", "slug")
SELECT 'cat_' || substr(md5(normalized), 1, 24), name, normalized, 'legacy-' || substr(md5(normalized), 1, 24)
FROM values_to_copy
ON CONFLICT ("normalizedName") DO NOTHING;

INSERT INTO "ExhibitionCategory" ("exhibitionId", "categoryId")
SELECT e."id", c."id"
FROM "Exhibition" e
JOIN "IndustryCategory" c
  ON c."normalizedName" = lower(regexp_replace(trim(e."industry"), '\s+', ' ', 'g'))
ON CONFLICT DO NOTHING;

-- Backfill topics from the legacy JSON array. Malformed/non-array JSON is ignored.
WITH topic_values AS (
  SELECT DISTINCT
    trim(topic.value) AS name,
    lower(regexp_replace(trim(topic.value), '\s+', ' ', 'g')) AS normalized
  FROM "Exhibition" e
  CROSS JOIN LATERAL jsonb_array_elements_text(
    CASE WHEN jsonb_typeof(e."topics"::jsonb) = 'array' THEN e."topics"::jsonb ELSE '[]'::jsonb END
  ) AS topic(value)
  WHERE trim(topic.value) <> ''
)
INSERT INTO "Topic" ("id", "name", "normalizedName", "slug")
SELECT 'top_' || substr(md5(normalized), 1, 24), name, normalized, 'legacy-' || substr(md5(normalized), 1, 24)
FROM topic_values
ON CONFLICT ("normalizedName") DO NOTHING;

INSERT INTO "ExhibitionTopic" ("exhibitionId", "topicId")
SELECT e."id", t."id"
FROM "Exhibition" e
CROSS JOIN LATERAL jsonb_array_elements_text(
  CASE WHEN jsonb_typeof(e."topics"::jsonb) = 'array' THEN e."topics"::jsonb ELSE '[]'::jsonb END
) AS topic(value)
JOIN "Topic" t
  ON t."normalizedName" = lower(regexp_replace(trim(topic.value), '\s+', ' ', 'g'))
ON CONFLICT DO NOTHING;

-- Safe best-effort ISO backfill for the bundled seed catalog. Other legacy rows
-- remain nullable and receive a code the next time they are edited.
UPDATE "Exhibition" SET "countryCode" = CASE "country"
  WHEN 'Belgium' THEN 'BE'
  WHEN 'Denmark' THEN 'DK'
  WHEN 'Germany' THEN 'DE'
  WHEN 'Singapore' THEN 'SG'
  WHEN 'South Africa' THEN 'ZA'
  WHEN 'United Arab Emirates' THEN 'AE'
  WHEN 'United Kingdom' THEN 'GB'
  WHEN 'United States' THEN 'US'
  ELSE "countryCode"
END;

ALTER TABLE "ExhibitionCategory" ADD CONSTRAINT "ExhibitionCategory_exhibitionId_fkey"
  FOREIGN KEY ("exhibitionId") REFERENCES "Exhibition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExhibitionCategory" ADD CONSTRAINT "ExhibitionCategory_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "IndustryCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExhibitionTopic" ADD CONSTRAINT "ExhibitionTopic_exhibitionId_fkey"
  FOREIGN KEY ("exhibitionId") REFERENCES "Exhibition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExhibitionTopic" ADD CONSTRAINT "ExhibitionTopic_topicId_fkey"
  FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
