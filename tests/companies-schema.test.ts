import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const schema = readFileSync("prisma/schema.prisma", "utf8");
const migration = readFileSync("prisma/migrations/202610050001_companies/migration.sql", "utf8");

describe("company database constraints", () => {
  it("reuses the existing taxonomy and exhibition masters through join entities", () => {
    expect(schema).toContain("model CompanyCategory"); expect(schema).toContain("IndustryCategory @relation");
    expect(schema).toContain("model CompanyTopic"); expect(schema).toContain("Topic   @relation");
    expect(schema).toContain("@@unique([companyId, exhibitionId])");
  });
  it("enforces one primary contact and priority bounds in PostgreSQL", () => {
    expect(migration).toContain('"CompanyContact_one_primary_per_company"');
    expect(migration).toContain('WHERE "isPrimary" = true');
    expect(migration).toContain('"Company_priorityScore_check"');
  });
  it("cascades only company-owned records and restricts master deletion", () => {
    expect(migration).toMatch(/CompanyContact_companyId_fkey[\s\S]+ON DELETE CASCADE/);
    expect(migration).toMatch(/CompanyExhibition_exhibitionId_fkey[\s\S]+ON DELETE RESTRICT/);
    expect(migration).toMatch(/CompanyCategory_categoryId_fkey[\s\S]+ON DELETE RESTRICT/);
  });
});
