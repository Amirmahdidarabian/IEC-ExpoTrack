import { beforeEach, describe, expect, it, vi } from "vitest";
import { folderSchema, membershipSchema } from "@/lib/companies/folder-schema";
import { matchImportedCompany } from "@/lib/companies/import-matching";
import { companyWhere, parseCompanyQuery } from "@/lib/companies/query";
import { companyImportMappingSchema, detectCompanyImportMapping, prepareImportedCompanyRow } from "@/lib/companies/import-mapping";

const fixture = { id: "one", normalizedName: "example", domain: "example.com", countryCode: "GB" };
describe("company folder validation and identity", () => {
  it("accepts folder names and limits unsafe/empty/oversized inputs", () => {
    expect(folderSchema.parse({ name: "  ROV Subsea  " })).toMatchObject({ name: "ROV Subsea", color: "cyan" });
    for (const name of ["", "   ", "---", "x".repeat(101)]) expect(folderSchema.safeParse({ name }).success).toBe(false);
    expect(folderSchema.safeParse({ name: "ROV", color: "arbitrary" }).success).toBe(false);
    expect(membershipSchema.safeParse({ companyIds: [], folderId: "folder", action: "add" }).success).toBe(false);
    expect(membershipSchema.safeParse({ companyIds: Array(101).fill("one"), folderId: "folder", action: "remove" }).success).toBe(false);
  });
  it("filters membership through EXISTS-style relational predicates, never a multiplying join", () => {
    expect(companyWhere(parseCompanyQuery({ folder: "folder-one" }))).toEqual({ AND: [{ folders: { some: { folderId: "folder-one" } } }] });
    expect(companyWhere(parseCompanyQuery({ folder: "unfiled" }))).toEqual({ AND: [{ folders: { none: {} } }] });
    expect(companyWhere(parseCompanyQuery({ folder: "all" }))).toEqual({});
  });
  it("confidently matches an exact name/domain or name/country", () => {
    expect(matchImportedCompany(fixture, [fixture])).toEqual({ kind: "match", id: "one" });
    expect(matchImportedCompany({ ...fixture, domain: null }, [fixture])).toEqual({ kind: "match", id: "one" });
    expect(matchImportedCompany({ ...fixture, normalizedName: "new", domain: "new.example" }, [fixture])).toEqual({ kind: "new" });
  });
  it("never merges ambiguous domains, contradictory countries or shared websites", () => {
    const cases = [
      [fixture, [fixture, { ...fixture, id: "two" }]],
      [{ ...fixture, normalizedName: "different company" }, [fixture]],
      [{ ...fixture, countryCode: "US" }, [fixture]],
      [{ ...fixture, domain: "different.example" }, [fixture]],
      [{ ...fixture, domain: null, countryCode: null }, [{ ...fixture, domain: null, countryCode: null }]],
    ] as const;
    for (const [row, existing] of cases) expect(matchImportedCompany(row, [...existing]).kind).toBe("ambiguous");
  });
  it("maps the actual workbook descriptions header and preserves different contact emails", () => {
    expect(detectCompanyImportMapping(["Company name", "website", "email", "country", "descriptions"])).toEqual({ name: 1, website: 2, email: 3, country: 4, description: 5 });
    const result = prepareImportedCompanyRow({ row: 2, name: "Example", email: "ONE@example.com;two@example.com\none@example.com,invalid" });
    if (!result.ok) throw new Error("Expected valid row");
    expect(result.value.emails).toEqual(["one@example.com", "two@example.com"]);
    expect(result.value.warnings).toEqual(["Invalid contact email omitted."]);
    expect(companyImportMappingSchema.parse({ name: 1, email: 0 })).toMatchObject({ name: 1, email: undefined });
    expect(companyImportMappingSchema.safeParse({ name: 1, email: -1 }).success).toBe(false);
  });
});

const tx = vi.hoisted(() => ({ companyFolder: { create: vi.fn(), update: vi.fn(), delete: vi.fn(), findUnique: vi.fn(), findUniqueOrThrow: vi.fn() }, company: { count: vi.fn(), delete: vi.fn() }, companyFolderMembership: { createMany: vi.fn(), deleteMany: vi.fn() }, auditLog: { create: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: { $transaction: (callback: (client: typeof tx) => unknown) => callback(tx) } }));
import { changeFolderMembership, deleteCompanyFolder, saveCompanyFolder } from "@/lib/companies/folders";
describe("company folder repository", () => {
  beforeEach(() => { vi.clearAllMocks(); tx.companyFolder.findUnique.mockResolvedValue({ id: "folder", name: "ROV" }); tx.companyFolder.findUniqueOrThrow.mockResolvedValue({ id: "folder", name: "ROV" }); tx.company.count.mockResolvedValue(1); tx.companyFolderMembership.createMany.mockResolvedValue({ count: 1 }); tx.companyFolderMembership.deleteMany.mockResolvedValue({ count: 1 }); });
  it("normalizes folder names and records an authenticated audit action", async () => {
    tx.companyFolder.create.mockResolvedValue({ id: "folder", name: "ROV Subsea" });
    await saveCompanyFolder({ name: "ROV Subsea" }, "actor");
    expect(tx.companyFolder.create).toHaveBeenCalledWith({ data: { name: "ROV Subsea", normalizedName: "rov subsea", description: "", color: "cyan" } });
    expect(tx.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ actorUserId: "actor", action: "COMPANY_FOLDER_CREATED" }) });
  });
  it("deduplicates IDs and uses the composite unique key for idempotent membership", async () => {
    await changeFolderMembership({ companyIds: ["one", "one"], folderId: "folder", action: "add" }, "actor");
    expect(tx.companyFolderMembership.createMany).toHaveBeenCalledWith({ data: [{ companyId: "one", folderId: "folder" }], skipDuplicates: true });
  });
  it("removes links without deleting companies", async () => {
    await changeFolderMembership({ companyIds: ["one"], folderId: "folder", action: "remove" }, "actor");
    expect(tx.companyFolderMembership.deleteMany).toHaveBeenCalledWith({ where: { folderId: "folder", companyId: { in: ["one"] } } });
    tx.company.delete.mockClear(); await deleteCompanyFolder("folder", "actor"); expect(tx.company.delete).not.toHaveBeenCalled();
    expect(tx.companyFolder.delete).toHaveBeenCalledWith({ where: { id: "folder" } });
  });
  it("rejects missing companies/folders before any membership mutation", async () => {
    tx.company.count.mockResolvedValue(0);
    await expect(changeFolderMembership({ companyIds: ["missing"], folderId: "folder", action: "add" }, "actor")).rejects.toThrow("not found");
    expect(tx.companyFolderMembership.createMany).not.toHaveBeenCalled();
  });
});
