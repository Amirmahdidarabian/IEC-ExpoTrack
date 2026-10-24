import { canonicalWebsite, corporateDomainFromEmail, normalizeCompanyName, normalizeCountry, normalizeDomain, normalizeEmail } from "./normalization";
import { z } from "zod";

export type CompanyImportMapping = { name: number; website?: number; email?: number; country?: number; description?: number };
const mappedColumn = z.preprocess((value) => value === 0 ? undefined : value, z.number().int().min(1).max(2000).optional());
export const companyImportMappingSchema = z.object({ name: mappedColumn, website: mappedColumn, email: mappedColumn, country: mappedColumn, description: mappedColumn });

const aliases: Record<keyof CompanyImportMapping, string[]> = {
  name: ["company name", "company", "name", "organisation", "organization"], website: ["website", "web site", "url", "domain"],
  email: ["email", "e-mail", "contact email"], country: ["country", "country name", "nation"], description: ["explanation", "description", "descriptions", "about", "notes"],
};

function normalizeHeader(value: string) { return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US"); }

export function detectCompanyImportMapping(headers: string[]): Partial<CompanyImportMapping> {
  return Object.fromEntries(Object.entries(aliases).flatMap(([field, names]) => { const index = headers.findIndex((header) => names.includes(normalizeHeader(header))); return index >= 0 ? [[field, index + 1]] : []; })) as Partial<CompanyImportMapping>;
}

export type PreparedCompanyRow = { row: number; name: string; normalizedName: string; website: string | null; domain: string | null; email: string | null; emails: string[]; countryCode: string | null; country: string | null; description: string | null; warnings: string[] };
export type PreparedImportResult = { ok: true; value: PreparedCompanyRow } | { ok: false; issue: { row: number; field: string; message: string } };

export function prepareImportedCompanyRow(input: { row: number; name: string; website?: string; email?: string; country?: string; description?: string }): PreparedImportResult {
  const name = input.name.trim(); if (!name) return { ok: false, issue: { row: input.row, field: "Company Name", message: "Company name is required." } };
  if (name.length > 240 || !normalizeCompanyName(name)) return { ok: false, issue: { row: input.row, field: "Company Name", message: "Company name must contain letters or numbers and be at most 240 characters." } };
  const warnings: string[] = []; const rawWebsite = input.website?.trim() ?? ""; const rawEmail = input.email?.trim() ?? ""; const rawCountry = input.country?.trim() ?? "";
  let website: string | null = null; let domain: string | null = null; let email: string | null = null;
  if (rawWebsite) { domain = normalizeDomain(rawWebsite); website = canonicalWebsite(rawWebsite); if (!domain) warnings.push("Invalid website omitted."); }
  const emails = [...new Set(rawEmail.split(/[;,\n\r]+/).map(normalizeEmail).filter((value): value is string => Boolean(value)))];
  const validEmails = emails.filter((value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 320);
  if (validEmails.length < emails.length) warnings.push("Invalid contact email omitted.");
  email = validEmails[0] ?? null;
  if (!domain && email) domain = corporateDomainFromEmail(email);
  const normalizedCountry = normalizeCountry(rawCountry); if (rawCountry && !normalizedCountry) warnings.push("Unrecognized country retained without a country code.");
  return { ok: true, value: { row: input.row, name, normalizedName: normalizeCompanyName(name), website, domain, email, emails: validEmails, countryCode: normalizedCountry?.code ?? null, country: normalizedCountry?.name ?? (rawCountry || null), description: input.description?.trim() || null, warnings } };
}

export function sanitizeSpreadsheetCell(value: string) { return /^[=+\-@]/.test(value) ? `'${value}` : value; }

