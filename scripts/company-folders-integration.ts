/** Real local PostgreSQL checks. Deletes only synthetic fixture IDs owned by this run. */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import ExcelJS from "exceljs";
import { prisma } from "../lib/prisma";
import { changeFolderMembership, deleteCompanyFolder, saveCompanyFolder } from "../lib/companies/folders";
import { importCompanies } from "../lib/companies/import-service";
import { listCompanies } from "../lib/companies/repository";
import { parseCompanyQuery } from "../lib/companies/query";

async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1"].includes(url.hostname) || url.port !== "55432" || url.pathname !== "/iec_expobot") throw new Error("Local iec_expobot:55432 only.");
  const prefix = `folder-regression-${randomBytes(8).toString("hex")}`;
  const before = { companies: await prisma.company.count(), contacts: await prisma.companyContact.count(), folders: await prisma.companyFolder.count(), exhibitions: await prisma.exhibition.count(), media: await prisma.mediaOutlet.count() };
  const actor = await prisma.user.create({ data: { username: prefix, passwordHash: randomBytes(32).toString("hex"), role: "ADMIN", mustChangePassword: false } });
  const owned: string[] = [], folders: string[] = [];
  let checks = 0;
  function pass(condition: unknown, label: string) { assert.ok(condition, label); checks++; console.log(`PASS ${label}`); }
  async function workbook(rows: unknown[][]) { const book = new ExcelJS.Workbook(); book.addWorksheet("Companies").addRows([["Company name", "website", "email", "country", "descriptions"], ...rows]); return Buffer.from(await book.xlsx.writeBuffer()); }
  try {
    const first = await saveCompanyFolder({ name: `${prefix} ROV` }, actor.id); folders.push(first.id);
    const second = await saveCompanyFolder({ name: `${prefix} USV` }, actor.id); folders.push(second.id);
    const name = `${prefix} Company`, domain = `${prefix}.example`;
    const bytes = await workbook([[name, domain, "one@example.com", "UK", "Original description"], [name, domain, "two@example.com;three@example.com", "UK", "Never overwrite original"]]);
    const result = await importCompanies(bytes, `${prefix}.xlsx`, {}, actor.id, true, first.id);
    owned.push(...new Set(result.rows.flatMap((row) => row.companyId ? [row.companyId] : [])));
    pass(result.createdCompanies === 1 && result.createdContacts === 3 && result.linkedCompanies === 1, "Repeated workbook rows share one company and preserve three distinct contacts");
    const same = await importCompanies(bytes, `${prefix}-repeat.xlsx`, {}, actor.id, true, first.id);
    pass(same.createdCompanies === 0 && same.createdContacts === 0 && same.linkedCompanies === 0, "Reimport is idempotent for companies, contacts and folder memberships");
    const other = await importCompanies(bytes, `${prefix}-second.xlsx`, {}, actor.id, true, second.id);
    pass(other.createdCompanies === 0 && other.createdContacts === 0 && other.linkedCompanies === 1, "The same company links to another folder without a copied record");
    pass((await prisma.company.findUniqueOrThrow({ where: { id: owned[0] } })).description === "Original description", "Existing company description survives later imports");
    await assert.rejects(() => prisma.companyFolderMembership.create({ data: { companyId: owned[0], folderId: first.id } })); checks++;
    const list = await listCompanies(parseCompanyQuery({ folder: first.id, sort: "nearest" }));
    pass(list.total === 1 && list.items.length === 1 && list.items[0].id === owned[0], "Nearest-exhibition sorting preserves folder filtering and one row per company");
    const repeated = await changeFolderMembership({ companyIds: [owned[0], owned[0]], folderId: first.id, action: "add" }, actor.id);
    pass(repeated.changed === 0, "Bulk add to an existing folder is idempotent");
    await changeFolderMembership({ companyIds: owned, folderId: first.id, action: "remove" }, actor.id);
    pass(await prisma.companyFolderMembership.count({ where: { companyId: owned[0] } }) === 1 && await prisma.companyContact.count({ where: { companyId: owned[0] } }) === 3, "Removing from one folder preserves other memberships and contacts");
    await deleteCompanyFolder(second.id, actor.id);
    pass(Boolean(await prisma.company.findUnique({ where: { id: owned[0] } })) && await prisma.companyContact.count({ where: { companyId: owned[0] } }) === 3, "Deleting a folder never deletes company records or contacts");
    pass((await listCompanies(parseCompanyQuery({ folder: "unfiled", q: prefix }))).total === 1, "Unfiled view includes the company after its final membership is removed");
    const ambiguous = await workbook([[`${prefix} Different company`, domain, "must-not-attach@example.com", "UK", "Conflicting name"]]);
    const conflict = await importCompanies(ambiguous, `${prefix}-conflict.xlsx`, {}, actor.id, true, first.id);
    pass(conflict.createdCompanies === 0 && conflict.createdContacts === 0 && conflict.linkedCompanies === 0 && conflict.failedRows === 1, "Shared-domain/name conflicts are reported without attaching contacts or memberships");
    await assert.rejects(() => importCompanies(bytes, `${prefix}-invalid.xlsx`, {}, actor.id, true, "missing-folder"), /Destination folder/); checks++;
    pass(await prisma.company.count() === before.companies + 1, "Failed import leaves no extra company records");
    const third = await saveCompanyFolder({ name: `${prefix} Concurrent` }, actor.id); folders.push(third.id);
    const simultaneousBytes = await workbook([[`${prefix} Concurrent company`, `${prefix}-concurrent.example`, "concurrent@example.com", "USA", "Concurrent import"]]);
    const simultaneous = await Promise.all([importCompanies(simultaneousBytes, `${prefix}-parallel-one.xlsx`, {}, actor.id, true, first.id), importCompanies(simultaneousBytes, `${prefix}-parallel-two.xlsx`, {}, actor.id, true, third.id)]);
    owned.push(...new Set(simultaneous.flatMap((report) => report.rows.flatMap((row) => row.companyId ? [row.companyId] : []))));
    pass(simultaneous.reduce((sum, report) => sum + report.createdCompanies, 0) === 1 && simultaneous.reduce((sum, report) => sum + report.createdContacts, 0) === 1, "Concurrent workbook imports serialize to one company and one contact");
    pass(await prisma.exhibition.count() === before.exhibitions && await prisma.mediaOutlet.count() === before.media, "Existing Exhibitions and Media records are unchanged");
  } finally {
    // Never select imported user data by a broad name/domain prefix for deletion.
    if (owned.length) await prisma.company.deleteMany({ where: { id: { in: owned } } });
    if (folders.length) await prisma.companyFolder.deleteMany({ where: { id: { in: folders } } });
    await prisma.companyImportJob.deleteMany({ where: { startedById: actor.id } });
    await prisma.auditLog.deleteMany({ where: { actorUserId: actor.id } });
    await prisma.user.delete({ where: { id: actor.id } });
  }
  pass(await prisma.company.count() === before.companies && await prisma.companyContact.count() === before.contacts && await prisma.companyFolder.count() === before.folders, "Only synthetic fixtures removed; actual imported data preserved");
  console.log(`Company folder integration: ${checks} checks passed.`);
}
main().catch((error) => { console.error(error instanceof Error ? error.message : "Integration failed"); process.exitCode = 1; }).finally(() => prisma.$disconnect());
