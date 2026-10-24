/** Local PostgreSQL only. Workbook bytes and backup exports never enter Git. */
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { createHash } from "node:crypto";
import { prisma } from "../lib/prisma";
import { importCompanies, previewCompanyImport } from "../lib/companies/import-service";
import { saveCompanyFolder } from "../lib/companies/folders";
import { normalizeCompanyName } from "../lib/companies/normalization";

function guard() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1"].includes(url.hostname) || url.port !== "55432" || url.pathname !== "/iec_expobot") throw new Error("Refusing: local iec_expobot on localhost:55432 only. Production changes need separate approval.");
}
const sources: Record<string, { name: string; color: string }> = {
  "ROV SUBSEA EXCEL.xlsx": { name: "ROV Subsea", color: "cyan" },
  "UXO COMPANIES.xlsx": { name: "UXO", color: "violet" },
  "LOADING ARMS EXCEL.xlsx": { name: "Loading Arms", color: "amber" },
  "USV COMPANIES.xlsx": { name: "USV", color: "emerald" },
};
async function main() {
  guard(); const [command, ...files] = process.argv.slice(2);
  if (command === "backup") {
    const container = execFileSync("docker", ["ps", "--filter", "publish=55432", "--format", "{{.ID}}"], { encoding: "utf8" }).trim();
    if (!/^[a-f0-9]+$/.test(container)) throw new Error("Expected exactly one local PostgreSQL container on port 55432.");
    const dump = execFileSync("docker", ["exec", container, "sh", "-c", 'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc'], { maxBuffer: 256 * 1024 * 1024 });
    if (!dump.length) throw new Error("Empty database backup.");
    execFileSync("docker", ["exec", "-i", container, "pg_restore", "--list"], { input: dump, stdio: ["pipe", "ignore", "pipe"] });
    await mkdir("outputs/company-folder-import", { recursive: true });
    const path = `outputs/company-folder-import/before-folders-${Date.now()}.dump`;
    await writeFile(path, dump, { flag: "wx", mode: 0o600 }); console.log(JSON.stringify({ backup: path, archiveListingVerified: true, bytes: dump.length })); return;
  }
  if (command === "migrate") { execFileSync(process.execPath, [resolve("node_modules/prisma/build/index.js"), "migrate", "deploy"], { stdio: "inherit" }); return; }
  if (command === "inspect") {
    console.log(JSON.stringify({ companies: await prisma.company.count(), contacts: await prisma.companyContact.count(), exhibitions: await prisma.exhibition.count(), media: await prisma.mediaOutlet.count(), activeAdmin: Boolean(await prisma.user.findFirst({ where: { role: "ADMIN", isActive: true }, select: { id: true } })) })); return;
  }
  if (command === "verify") {
    const folders = await prisma.companyFolder.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { companies: true } } } });
    const duplicateLinks = await prisma.$queryRaw<{ count: bigint }[]>`SELECT COUNT(*) AS count FROM (SELECT "companyId", "folderId" FROM "CompanyFolderMembership" GROUP BY "companyId", "folderId" HAVING COUNT(*) > 1) d`;
    console.log(JSON.stringify({ companies: await prisma.company.count(), contacts: await prisma.companyContact.count(), duplicateMemberships: Number(duplicateLinks[0].count), folders: folders.map((folder) => ({ name: folder.name, companies: folder._count.companies })), unfiled: await prisma.company.count({ where: { folders: { none: {} } } }) }, null, 2)); return;
  }
  if (!["preview", "import"].includes(command) || !files.length) throw new Error("Usage: backup | migrate | inspect | verify | preview/import <approved .xlsx paths>");
  const actor = await prisma.user.findFirst({ where: { role: "ADMIN", isActive: true }, orderBy: { createdAt: "asc" }, select: { id: true } });
  if (!actor) throw new Error("No active local administrator exists.");
  const report = [];
  for (const file of files) {
    const source = sources[basename(file)]; if (!source) throw new Error("Unrecognized source workbook; no automatic folder naming.");
    const bytes = await readFile(file);
    if (command === "preview") { const result = await previewCompanyImport(bytes); console.log(JSON.stringify({ file: basename(file), totalRows: result.totalRows, validRows: result.validRows, duplicates: result.duplicates, warnings: result.warnings, failedRows: result.failedRows, mapping: result.mapping })); continue; }
    const folder = await prisma.companyFolder.findUnique({ where: { normalizedName: normalizeCompanyName(source.name) } }) ?? await saveCompanyFolder(source, actor.id);
    const result = await importCompanies(bytes, basename(file), {}, actor.id, true, folder.id);
    console.log(JSON.stringify({ folder: source.name, totalRows: result.totalRows, createdCompanies: result.createdCompanies, updatedCompanies: result.updatedCompanies, createdContacts: result.createdContacts, linkedCompanies: result.linkedCompanies, duplicates: result.duplicates, failedRows: result.failedRows, warnings: result.warnings }));
    report.push({ file: basename(file), sha256: createHash("sha256").update(bytes).digest("hex"), folder: source.name, ...result });
  }
  if (command === "import") {
    await mkdir("outputs/company-folder-import", { recursive: true });
    const path = `outputs/company-folder-import/report-${Date.now()}.json`;
    await writeFile(path, JSON.stringify(report, null, 2), { flag: "wx", mode: 0o600 }); console.log(`Private report: ${path}`);
  }
}
main().catch((error) => { console.error(error instanceof Error ? error.message : "Local company-folder operation failed"); process.exitCode = 1; }).finally(() => prisma.$disconnect());
