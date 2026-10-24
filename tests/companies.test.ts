import { describe, expect, it } from "vitest";
import { companyPrioritySchema, companySchema, contactSchema } from "@/lib/companies/schema";
import { detectCompanyImportMapping, prepareImportedCompanyRow, sanitizeSpreadsheetCell } from "@/lib/companies/import-mapping";
import { canonicalWebsite, corporateDomainFromEmail, normalizeCompanyName, normalizeCountry, normalizeDomain } from "@/lib/companies/normalization";
import { priorityLevel, priorityRange } from "@/lib/companies/priority";
import { companyOrderBy, companyWhere, parseCompanyQuery } from "@/lib/companies/query";

describe("company normalization", () => {
  it("normalizes equivalent websites to a stable domain and canonical URL", () => {
    expect(["https://www.Example.com/", "www.example.com", "example.com/"].map(normalizeDomain)).toEqual(["example.com", "example.com", "example.com"]);
    expect(canonicalWebsite("www.Example.com/")).toBe("https://example.com");
  });
  it("normalizes company names and countries without guessing unknown values", () => {
    expect(normalizeCompanyName("  Diodon   Drone—Technology ")).toBe("diodon drone technology");
    expect(normalizeCountry("Turkey")).toEqual({ code: "TR", name: "Türkiye" });
    expect(normalizeCountry("USA")).toEqual({ code: "US", name: "United States" });
    expect(normalizeCountry("Atlantis")).toBeNull();
  });
  it("never uses a free email provider as company identity", () => {
    expect(corporateDomainFromEmail("owner@gmail.com")).toBeNull();
    expect(corporateDomainFromEmail("sales@slb.com")).toBe("slb.com");
  });
});

describe("company priority and validation", () => {
  it("derives every priority level at its boundary", () => {
    expect([priorityLevel(100), priorityLevel(90), priorityLevel(89), priorityLevel(75), priorityLevel(74), priorityLevel(50), priorityLevel(49), priorityLevel(0), priorityLevel(null)]).toEqual(["TOP", "TOP", "HIGH", "HIGH", "MEDIUM", "MEDIUM", "LOW", "LOW", "UNREVIEWED"]);
    expect(priorityRange("TOP")).toEqual({ gte: 90, lte: 100 });
  });
  it("rejects out-of-range scores and malformed contacts", () => {
    expect(companySchema.safeParse({ name: "Valid", priorityScore: 101 }).success).toBe(false);
    expect(companySchema.safeParse({ name: "Valid", priorityScore: 0 }).success).toBe(true);
    expect(companyPrioritySchema.safeParse({ priorityScore: 82 }).success).toBe(true);
    expect(companyPrioritySchema.safeParse({ priorityScore: -1 }).success).toBe(false);
    expect(contactSchema.safeParse({ email: "not-an-email" }).success).toBe(false);
    expect(contactSchema.safeParse({ email: "info@example.com", isPrimary: true }).success).toBe(true);
  });
});

describe("company query parsing", () => {
  it("bounds pagination and builds relational filters server-side", () => {
    const query = parseCompanyQuery({ q: "drone", country: "fr", priority: "TOP", hasEmail: "true", page: "2", pageSize: "100", sort: "contacts-desc" });
    expect(query).toMatchObject({ q: "drone", country: "fr", priority: "TOP", hasEmail: true, page: 2, pageSize: 100, sort: "contacts-desc" });
    expect(companyWhere(query)).toHaveProperty("AND"); expect(companyOrderBy(query.sort)[0]).toEqual({ contacts: { _count: "desc" } });
  });
  it("falls back safely when query parameters are invalid", () => expect(parseCompanyQuery({ page: "-10", pageSize: "5000", sort: "unsafe" })).toMatchObject({ page: 1, pageSize: 50, sort: "name-asc" }));
  it("maps legacy priority sorting to company name sorting", () => expect(parseCompanyQuery({ sort: "priority-desc" })).toMatchObject({ sort: "name-asc" }));
  it("accepts All and resets pagination while preserving folder and filters", () => {
    expect(parseCompanyQuery({ folder: "folder-one", q: "rov", hasEmail: "true", sort: "nearest", pageSize: "all", page: "999" })).toMatchObject({ folder: "folder-one", q: "rov", hasEmail: true, sort: "nearest", pageSize: "all", page: 1 });
  });
});

describe("Excel mapping", () => {
  it("detects legacy columns and maps Email to a contact value", () => {
    expect(detectCompanyImportMapping(["Company Name", "website", "Email", "Country", "Explanation"])).toEqual({ name: 1, website: 2, email: 3, country: 4, description: 5 });
    const prepared = prepareImportedCompanyRow({ row: 2, name: "ACCWING", email: "INFO@ACCWINGSAIL.COM", country: "France", description: "Marine technology" });
    if (!prepared.ok) throw new Error("Expected valid row");
    expect(prepared.value.email).toBe("info@accwingsail.com");
    expect(prepared.value.domain).toBe("accwingsail.com");
    expect(prepared.value.description).toBe("Marine technology");
  });
  it("treats optional invalid values as warnings and sanitizes formula-like exports", () => {
    const prepared = prepareImportedCompanyRow({ row: 3, name: "Example", website: "not a site", email: "broken" });
    if (!prepared.ok) throw new Error("Expected warning row");
    expect(prepared.value.warnings).toHaveLength(2);
    expect(sanitizeSpreadsheetCell("=HYPERLINK(\"bad\")")).toMatch(/^'/);
  });
});

