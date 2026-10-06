import { canonicalWebsite, corporateDomainFromEmail, normalizeCompanyName, normalizeCountry, normalizeDomain, normalizeEmail } from "./normalization";

export type CompanyImportMapping = { name: number; website?: number; email?: number; country?: number; description?: number };

const aliases: Record<keyof CompanyImportMapping, string[]> = {
  name: ["company name", "company", "name", "organisation", "organization"], website: ["website", "web site", "url", "domain"],
  email: ["email", "e-mail", "contact email"], country: ["country", "country name", "nation"], description: ["explanation", "description", "about", "notes"],
};

function normalizeHeader(value: string) { return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US"); }

export function detectCompanyImportMapping(headers: string[]): Partial<CompanyImportMapping> {
  return Object.fromEntries(Object.entries(aliases).flatMap(([field, names]) => { const index = headers.findIndex((header) => names.includes(normalizeHeader(header))); return index >= 0 ? [[field, index + 1]] : []; })) as Partial<CompanyImportMapping>;
}

export type PreparedCompanyRow = { row: number; name: string; normalizedName: string; website: string | null; domain: string | null; email: string | null; countryCode: string | null; country: string | null; description: string | null; warnings: string[] };
export type PreparedImportResult = { ok: true; value: PreparedCompanyRow } | { ok: false; issue: { row: number; field: string; message: string } };

export function prepareImportedCompanyRow(input: { row: number; name: string; website?: string; email?: string; country?: string; description?: string }): PreparedImportResult {
  const name = input.name.trim(); if (!name) return { ok: false, issue: { row: input.row, field: "Company Name", message: "Company name is required." } };
  const warnings: string[] = []; const rawWebsite = input.website?.trim() ?? ""; const rawEmail = input.email?.trim() ?? ""; const rawCountry = input.country?.trim() ?? "";
  let website: string | null = null; let domain: string | null = null; let email: string | null = null;
  if (rawWebsite) { domain = normalizeDomain(rawWebsite); website = canonicalWebsite(rawWebsite); if (!domain) warnings.push("Invalid website omitted."); }
  if (rawEmail) { email = normalizeEmail(rawEmail); if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 320) { email = null; warnings.push("Invalid contact email omitted."); } }
  if (!domain && email) domain = corporateDomainFromEmail(email);
  const normalizedCountry = normalizeCountry(rawCountry); if (rawCountry && !normalizedCountry) warnings.push("Unrecognized country retained without a country code.");
  return { ok: true, value: { row: input.row, name, normalizedName: normalizeCompanyName(name), website, domain, email, countryCode: normalizedCountry?.code ?? null, country: normalizedCountry?.name ?? (rawCountry || null), description: input.description?.trim() || null, warnings } };
}

export function sanitizeSpreadsheetCell(value: string) { return /^[=+\-@]/.test(value) ? `'${value}` : value; }

