ALTER TABLE "Exhibition" ADD COLUMN "exhibitorListWithLink" BOOLEAN NOT NULL DEFAULT false;

UPDATE "Exhibition" SET "exhibitorListWithLink" = true
WHERE "exhibitorList" = true AND btrim("exhibitorListUrl") <> '';
