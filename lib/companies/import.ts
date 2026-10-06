import "server-only";
import ExcelJS from "exceljs";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { searchCountries } from "@/lib/locations";
import { detectCompanyImportMapping, prepareImportedCompanyRow, type CompanyImportMapping } from "./import-mapping";
import { normalizeNamespacedXlsx } from "./xlsx-normalization";

export const MAX_COMPANY_IMPORT_BYTES = Number(process.env.COMPANY_IMPORT_MAX_BYTES || 20 * 1024 * 1024);
export class CompanyImportError extends Error {}
export type ImportMapping = CompanyImportMapping;
type ParsedRow = { row: number; name: string; normalizedName: string; website: string | null; domain: string | null; email: string | null; countryCode: string | null; country: string | null; description: string | null; warnings: string[] };
type ImportIssue = { row: number; field: string; message: string };

function safeCellText(cell: ExcelJS.Cell) {
  const value = cell.value;
  if (value && typeof value === "object" && "formula" in value) return String(value.result ?? "").trim();
  return cell.text.trim();
}

async function readWorkbook(buffer: Buffer) {
  const load = async (value: Buffer) => { const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer); return workbook; };
  let workbook: ExcelJS.Workbook;
  try { workbook = await load(buffer); }
  catch {
    try { const normalized = await normalizeNamespacedXlsx(buffer); if (!normalized) throw new Error("No compatible namespace normalization available."); workbook = await load(normalized); }
    catch { throw new CompanyImportError("The file is not a readable .xlsx workbook."); }
  }
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new CompanyImportError("The workbook does not contain a worksheet.");
  const headers: string[] = []; sheet.getRow(1).eachCell({ includeEmpty: true }, (cell, column) => { headers[column - 1] = safeCellText(cell); });
  if (!headers.some(Boolean)) throw new CompanyImportError("The first row must contain column headings.");
  return { sheet, headers };
}

async function parseRows(buffer: Buffer, requested?: Partial<ImportMapping>) {
  const { sheet, headers } = await readWorkbook(buffer); const detected = detectCompanyImportMapping(headers); const mapping = { ...detected, ...requested };
  if (!mapping.name || mapping.name < 1 || mapping.name > headers.length) throw new CompanyImportError("Map a valid Company Name column before importing.");
  const countries = await searchCountries("", 500); const countriesByName = new Map(countries.flatMap((country) => [[country.name.toLocaleLowerCase("en-US"), country] as const, [country.code.toLocaleLowerCase("en-US"), country] as const, [country.iso3.toLocaleLowerCase("en-US"), country] as const]));
  const rows: ParsedRow[] = []; const issues: ImportIssue[] = [];
  for (let index = 2; index <= sheet.actualRowCount; index++) {
    const row = sheet.getRow(index); const name = safeCellText(row.getCell(mapping.name));
    const rawWebsite = mapping.website ? safeCellText(row.getCell(mapping.website)) : ""; const rawEmail = mapping.email ? safeCellText(row.getCell(mapping.email)) : "";
    const rawCountry = mapping.country ? safeCellText(row.getCell(mapping.country)) : ""; const description = mapping.description ? safeCellText(row.getCell(mapping.description)) : "";
    if (![name, rawWebsite, rawEmail, rawCountry, description].some(Boolean)) continue;
    const prepared = prepareImportedCompanyRow({ row: index, name, website: rawWebsite, email: rawEmail, country: rawCountry, description });
    if (!prepared.ok) { issues.push(prepared.issue); continue; }
    if (rawCountry && !prepared.value.countryCode) { const country = countriesByName.get(rawCountry.normalize("NFKC").trim().toLocaleLowerCase("en-US")); if (country) { prepared.value.countryCode = country.code; prepared.value.country = country.name; const warning = "Unrecognized country retained without a country code."; prepared.value.warnings = prepared.value.warnings.filter((item) => item !== warning); } }
    rows.push(prepared.value); prepared.value.warnings.forEach((message) => issues.push({ row: index, field: "Warning", message }));
  }
  return { headers, mapping, rows, issues };
}

export async function previewCompanyImport(buffer: Buffer, requested?: Partial<ImportMapping>) {
  const parsed = await parseRows(buffer, requested); const domains = parsed.rows.flatMap((row) => row.domain ? [row.domain] : []); const names = [...new Set(parsed.rows.map((row) => row.normalizedName))];
  const existing = await prisma.company.findMany({ where: { OR: [{ domain: { in: domains } }, { normalizedName: { in: names } }] }, select: { id: true, name: true, domain: true, normalizedName: true, countryCode: true } });
  const domainSet = new Set(existing.flatMap((item) => item.domain ? [item.domain] : [])); const nameSet = new Set(existing.map((item) => `${item.normalizedName}|${item.countryCode ?? ""}`)); const inputKeys = new Set<string>(); let duplicates = 0;
  for (const row of parsed.rows) { const key = row.domain ? `d:${row.domain}` : `n:${row.normalizedName}|${row.countryCode ?? ""}`; if (inputKeys.has(key) || (row.domain && domainSet.has(row.domain)) || nameSet.has(`${row.normalizedName}|${row.countryCode ?? ""}`)) duplicates++; inputKeys.add(key); }
  return { headers: parsed.headers, mapping: parsed.mapping, totalRows: parsed.rows.length + parsed.issues.filter((issue) => issue.field === "Company Name").length, validRows: parsed.rows.length, duplicates,
    warnings: parsed.issues.filter((issue) => issue.field === "Warning").length, failedRows: parsed.issues.filter((issue) => issue.field !== "Warning").length, preview: parsed.rows.slice(0, 20), issues: parsed.issues.slice(0, 200) };
}

function chunks<T>(values: T[], size = 750) { return Array.from({ length: Math.ceil(values.length / size) }, (_, index) => values.slice(index * size, (index + 1) * size)); }

export async function importCompanies(buffer: Buffer, fileName: string, requested: Partial<ImportMapping>, actorId: string, updateExisting: boolean) {
  const job = await prisma.companyImportJob.create({ data: { fileName, startedById: actorId, status: "PROCESSING" } });
  await prisma.auditLog.create({ data: { actorUserId: actorId, action: "COMPANY_IMPORT_STARTED", entityType: "COMPANY_IMPORT", entityId: job.id, entityLabel: fileName, description: `Started company import ${fileName}` } });
  try {
    const parsed = await parseRows(buffer, requested); const domains = parsed.rows.flatMap((row) => row.domain ? [row.domain] : []); const names = [...new Set(parsed.rows.map((row) => row.normalizedName))];
    const existing = await prisma.company.findMany({ where: { OR: [{ domain: { in: domains } }, { normalizedName: { in: names } }] }, select: { id: true, name: true, domain: true, normalizedName: true, countryCode: true, website: true, country: true, description: true } });
    const byDomain = new Map<string, typeof existing>(); const byName = new Map<string, typeof existing>();
    existing.forEach((item) => { if (item.domain) byDomain.set(item.domain, [...(byDomain.get(item.domain) ?? []), item]); });
    existing.forEach((item) => { const key = `${item.normalizedName}|${item.countryCode ?? ""}`; byName.set(key, [...(byName.get(key) ?? []), item]); });
    const newRows: ParsedRow[] = []; const updates: { id: string; row: ParsedRow }[] = []; const accepted = new Map<string, ParsedRow>(); let duplicates = 0;
    for (const row of parsed.rows) {
      const key = row.domain ? `d:${row.domain}` : `n:${row.normalizedName}|${row.countryCode ?? ""}`; if (accepted.has(key)) { duplicates++; continue; }
      accepted.set(key, row); const domainMatches = row.domain ? byDomain.get(row.domain) ?? [] : []; const nameMatches = byName.get(`${row.normalizedName}|${row.countryCode ?? ""}`) ?? []; const match = domainMatches.length === 1 ? domainMatches[0] : domainMatches.length === 0 && nameMatches.length === 1 ? nameMatches[0] : undefined;
      if (match) { duplicates++; if (updateExisting) updates.push({ id: match.id, row }); } else if (domainMatches.length > 1 || nameMatches.length > 1) { duplicates++; parsed.issues.push({ row: row.row, field: "Duplicate", message: "Ambiguous company match skipped." }); } else newRows.push(row);
    }
    for (const group of chunks(newRows)) await prisma.company.createMany({ data: group.map((row) => ({ name: row.name, normalizedName: row.normalizedName, website: row.website, domain: row.domain, countryCode: row.countryCode, country: row.country, description: row.description, createdById: actorId })), skipDuplicates: true });
    for (const group of chunks(updates, 500)) await prisma.$transaction(group.map(({ id, row }) => prisma.company.update({ where: { id }, data: { website: row.website ?? undefined, domain: row.domain ?? undefined, countryCode: row.countryCode ?? undefined, country: row.country ?? undefined, description: row.description ?? undefined } })));
    const resolved = await prisma.company.findMany({ where: { OR: [{ domain: { in: parsed.rows.flatMap((row) => row.domain ? [row.domain] : []) } }, { normalizedName: { in: names } }] }, select: { id: true, domain: true, normalizedName: true, countryCode: true } });
    const resolvedDomain = new Map(resolved.flatMap((item) => item.domain ? [[item.domain, item.id] as const] : [])); const resolvedName = new Map(resolved.map((item) => [`${item.normalizedName}|${item.countryCode ?? ""}`, item.id]));
    const contacts = [
      ...newRows.flatMap((row) => { const companyId = (row.domain && resolvedDomain.get(row.domain)) || resolvedName.get(`${row.normalizedName}|${row.countryCode ?? ""}`); return companyId && row.email ? [{ companyId, email: row.email }] : []; }),
      ...updates.flatMap(({ id, row }) => row.email ? [{ companyId: id, email: row.email }] : []),
    ];
    let createdContacts = 0; for (const group of chunks(contacts)) { const result = await prisma.companyContact.createMany({ data: group, skipDuplicates: true }); createdContacts += result.count; }
    const result = { totalRows: parsed.rows.length + parsed.issues.filter((issue) => issue.field === "Company Name").length, validRows: parsed.rows.length, createdCompanies: newRows.length, updatedCompanies: updates.length, createdContacts, duplicates, warnings: parsed.issues.filter((issue) => issue.field === "Warning").length, failedRows: parsed.issues.filter((issue) => issue.field !== "Warning").length, issues: parsed.issues.slice(0, 500) };
    const { issues, warnings, ...jobMetrics } = result; const auditMetrics = { ...jobMetrics, warnings };
    await prisma.$transaction([prisma.companyImportJob.update({ where: { id: job.id }, data: { ...jobMetrics, status: "COMPLETED", completedAt: new Date(), errorSummary: issues as unknown as Prisma.InputJsonValue } }), prisma.auditLog.create({ data: { actorUserId: actorId, action: "COMPANY_IMPORT_COMPLETED", entityType: "COMPANY_IMPORT", entityId: job.id, entityLabel: fileName, description: `Completed company import ${fileName}`, metadata: auditMetrics } })]);
    return { jobId: job.id, ...result };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Import failed"; await prisma.$transaction([prisma.companyImportJob.update({ where: { id: job.id }, data: { status: "FAILED", completedAt: new Date(), errorSummary: { message } } }), prisma.auditLog.create({ data: { actorUserId: actorId, action: "COMPANY_IMPORT_FAILED", entityType: "COMPANY_IMPORT", entityId: job.id, entityLabel: fileName, description: `Company import failed: ${message.slice(0, 300)}` } })]); throw error;
  }
}

export function assertImportFile(file: File) {
  if (!file.name.toLocaleLowerCase("en-US").endsWith(".xlsx")) throw new CompanyImportError("Upload an .xlsx workbook.");
  if (!file.size || file.size > MAX_COMPANY_IMPORT_BYTES) throw new CompanyImportError(`Workbook must be smaller than ${Math.floor(MAX_COMPANY_IMPORT_BYTES / 1024 / 1024)} MB.`);
}
