import ExcelJS from "exceljs";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { searchCountries } from "@/lib/locations";
import { companyImportMappingSchema, detectCompanyImportMapping, prepareImportedCompanyRow, type CompanyImportMapping, type PreparedCompanyRow } from "./import-mapping";
import { normalizeNamespacedXlsx } from "./xlsx-normalization";
import { matchImportedCompany } from "./import-matching";

export const MAX_COMPANY_IMPORT_BYTES = Number(process.env.COMPANY_IMPORT_MAX_BYTES || 20 * 1024 * 1024);
export class CompanyImportError extends Error {}
export type ImportMapping = CompanyImportMapping;
type ParsedRow = PreparedCompanyRow;
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
  if (sheet.rowCount > 20000 || sheet.columnCount > 2000) throw new CompanyImportError("Workbook exceeds the 20,000-row or 2,000-column import limit.");
  const headers: string[] = []; sheet.getRow(1).eachCell({ includeEmpty: true }, (cell, column) => { headers[column - 1] = safeCellText(cell); });
  if (!headers.some(Boolean)) throw new CompanyImportError("The first row must contain column headings.");
  return { sheet, headers };
}

async function parseRows(buffer: Buffer, requested?: Partial<ImportMapping>) {
  const { sheet, headers } = await readWorkbook(buffer); const detected = detectCompanyImportMapping(headers); const mapping = { ...detected, ...companyImportMappingSchema.parse(requested ?? {}) };
  if (!mapping.name || mapping.name < 1 || mapping.name > headers.length) throw new CompanyImportError("Map a valid Company Name column before importing.");
  const countries = await searchCountries("", 500); const countriesByName = new Map(countries.flatMap((country) => [[country.name.toLocaleLowerCase("en-US"), country] as const, [country.code.toLocaleLowerCase("en-US"), country] as const, [country.iso3.toLocaleLowerCase("en-US"), country] as const]));
  const rows: ParsedRow[] = []; const issues: ImportIssue[] = [];
  for (let index = 2; index <= sheet.rowCount; index++) {
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
  let duplicates = 0;
  for (const row of parsed.rows) {
    const match = matchImportedCompany(row, existing);
    if (match.kind !== "new") duplicates++;
    if (match.kind === "ambiguous") parsed.issues.push({ row: row.row, field: "Duplicate", message: match.reason });
    if (match.kind === "new") existing.push({ id: `preview-${row.row}`, name: row.name, domain: row.domain, normalizedName: row.normalizedName, countryCode: row.countryCode });
  }
  return { headers: parsed.headers, mapping: parsed.mapping, totalRows: parsed.rows.length + parsed.issues.filter((issue) => issue.field === "Company Name").length, validRows: parsed.rows.length, duplicates,
    warnings: parsed.issues.filter((issue) => issue.field === "Warning").length, failedRows: parsed.issues.filter((issue) => issue.field !== "Warning").length, preview: parsed.rows.slice(0, 20), issues: parsed.issues.slice(0, 200) };
}

export async function importCompanies(buffer: Buffer, fileName: string, requested: Partial<ImportMapping>, actorId: string, updateExisting: boolean, folderId?: string) {
  const job = await prisma.companyImportJob.create({ data: { fileName, startedById: actorId, status: "PROCESSING" } });
  await prisma.auditLog.create({ data: { actorUserId: actorId, action: "COMPANY_IMPORT_STARTED", entityType: "COMPANY_IMPORT", entityId: job.id, entityLabel: fileName, description: `Started company import ${fileName}` } });
  try {
    const parsed = await parseRows(buffer, requested);
    return await prisma.$transaction(async (tx) => {
      // Serialize all company workbook imports, including across folders and concurrent requests.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('iec-company-import'))`;
      if (folderId && !await tx.companyFolder.findUnique({ where: { id: folderId } })) throw new CompanyImportError("Destination folder not found.");
      const domains = parsed.rows.flatMap((row) => row.domain ? [row.domain] : []);
      const names = [...new Set(parsed.rows.map((row) => row.normalizedName))];
      const select = { id: true, name: true, domain: true, normalizedName: true, countryCode: true, website: true, country: true, description: true } as const;
      const existing = await tx.company.findMany({ where: { OR: [{ domain: { in: domains } }, { normalizedName: { in: names } }] }, select });
      const companyIds = new Set<string>(); const updatedIds = new Set<string>();
      const rows: { row: number; companyId: string | null; status: string }[] = [];
      let createdCompanies = 0; let createdContacts = 0; let duplicates = 0;
      for (const row of parsed.rows) {
        const match = matchImportedCompany(row, existing);
        if (match.kind === "ambiguous") {
          duplicates++; parsed.issues.push({ row: row.row, field: "Duplicate", message: match.reason });
          rows.push({ row: row.row, companyId: null, status: "review" }); continue;
        }
        let company: typeof existing[number];
        if (match.kind === "new") {
          company = await tx.company.create({ data: { name: row.name, normalizedName: row.normalizedName, website: row.website, domain: row.domain, countryCode: row.countryCode, country: row.country, description: row.description, createdById: actorId }, select });
          existing.push(company); createdCompanies++;
        } else {
          duplicates++; company = existing.find((item) => item.id === match.id)!;
          if (updateExisting) {
            const fields = ["website", "domain", "countryCode", "country", "description"] as const;
            const data = Object.fromEntries(fields.filter((key) => !company[key] && row[key]).map((key) => [key, row[key]]));
            if (Object.keys(data).length) {
              company = await tx.company.update({ where: { id: company.id }, data, select });
              existing[existing.findIndex((item) => item.id === company.id)] = company;
              updatedIds.add(company.id);
            }
          }
        }
        companyIds.add(company.id); rows.push({ row: row.row, companyId: company.id, status: match.kind === "new" ? "created" : "matched" });
        if (row.emails.length) {
          const contacts = await tx.companyContact.createMany({ data: row.emails.map((email) => ({ companyId: company.id, email })), skipDuplicates: true });
          createdContacts += contacts.count;
        }
      }
      const linked = folderId && companyIds.size ? await tx.companyFolderMembership.createMany({ data: [...companyIds].map((companyId) => ({ companyId, folderId })), skipDuplicates: true }) : { count: 0 };
      const jobMetrics = { totalRows: parsed.rows.length + parsed.issues.filter((issue) => issue.field === "Company Name").length, validRows: parsed.rows.length, createdCompanies, updatedCompanies: updatedIds.size, createdContacts, duplicates, failedRows: parsed.issues.filter((issue) => issue.field !== "Warning").length };
      const warnings = parsed.issues.filter((issue) => issue.field === "Warning").length;
      const issues = parsed.issues.slice(0, 500);
      await tx.companyImportJob.update({ where: { id: job.id }, data: { ...jobMetrics, status: "COMPLETED", completedAt: new Date(), errorSummary: issues as unknown as Prisma.InputJsonValue } });
      await tx.auditLog.create({ data: { actorUserId: actorId, action: "COMPANY_IMPORT_COMPLETED", entityType: "COMPANY_IMPORT", entityId: job.id, entityLabel: fileName, description: `Completed company import ${fileName}`, metadata: { ...jobMetrics, warnings, folderId: folderId ?? null, linkedCompanies: linked.count } } });
      return { jobId: job.id, ...jobMetrics, warnings, linkedCompanies: linked.count, issues, rows };
    }, { maxWait: 120_000, timeout: 120_000 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Import failed"; await prisma.$transaction([prisma.companyImportJob.update({ where: { id: job.id }, data: { status: "FAILED", completedAt: new Date(), errorSummary: { message } } }), prisma.auditLog.create({ data: { actorUserId: actorId, action: "COMPANY_IMPORT_FAILED", entityType: "COMPANY_IMPORT", entityId: job.id, entityLabel: fileName, description: `Company import failed: ${message.slice(0, 300)}` } })]); throw error;
  }
}

export function assertImportFile(file: File) {
  if (!file.name.toLocaleLowerCase("en-US").endsWith(".xlsx")) throw new CompanyImportError("Upload an .xlsx workbook.");
  if (!file.size || file.size > MAX_COMPANY_IMPORT_BYTES) throw new CompanyImportError(`Workbook must be smaller than ${Math.floor(MAX_COMPANY_IMPORT_BYTES / 1024 / 1024)} MB.`);
}
