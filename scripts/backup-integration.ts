/** Full real-data round trip in a newly created, isolated LOCAL database. Never imports into the source. */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, writeFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { createExport, importBackup } from "../lib/data-management/service";
import { parseBackupText, type FullBackupDocument } from "../lib/data-management/schema";
import { fullBackup } from "../tests/fixtures/full-backup";

const run = promisify(execFile);
async function main() {
  const sourceUrl = new URL(process.env.DATABASE_URL ?? "");
  if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1"].includes(sourceUrl.hostname) || sourceUrl.port !== "55432" || sourceUrl.pathname !== "/iec_expobot") throw new Error("Only the local iec_expobot database on port 55432 is allowed.");
  const name = `iec_backup_verify_${randomBytes(8).toString("hex")}`;
  assert.match(name, /^iec_backup_verify_[a-f0-9]{16}$/);
  const targetUrl = new URL(sourceUrl); targetUrl.pathname = `/${name}`;
  const target = new PrismaClient({ datasourceUrl: targetUrl.toString(), log: [] });
  const before = { companies: await prisma.company.count(), contacts: await prisma.companyContact.count(), media: await prisma.mediaOutlet.count(), exhibitions: await prisma.exhibition.count(), users: await prisma.user.count() };
  let created = false, checks = 0;
  function pass(value: unknown, label: string) { assert.ok(value, label); checks++; console.log(`PASS ${label}`); }
  try {
    const sourceAdmin = await prisma.user.findFirstOrThrow({ where: { role: "ADMIN", isActive: true }, select: { id: true, username: true } });
    const backup = await createExport(sourceAdmin.id);
    assert.equal(backup.version, 2); if (backup.version !== 2) throw new Error("Full backup required");
    const parsed = parseBackupText(JSON.stringify(backup)); assert.equal(parsed.version, 2);
    await mkdir("outputs/full-backup-verification", { recursive: true });
    await writeFile("outputs/full-backup-verification/local-full-backup.json", JSON.stringify(backup, null, 2), { mode: 0o600 });
    pass(backup.data.companies.length === before.companies && backup.data.media.length === before.media && backup.data.exhibitions.length === before.exhibitions, "Actual source records included in validated v2 JSON");
    await prisma.$executeRawUnsafe(`CREATE DATABASE "${name}"`); created = true;
    try {
      await run(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], { env: { ...process.env, DATABASE_URL: targetUrl.toString() }, windowsHide: true, maxBuffer: 2 * 1024 * 1024 });
    } catch { throw new Error("Migration of isolated local verification database failed (connection details suppressed)."); }
    const hash = `!verification-${randomBytes(32).toString("hex")}`;
    const actor = await target.user.create({ data: { username: sourceAdmin.username, passwordHash: hash, role: "ADMIN", isActive: true, mustChangePassword: false } });
    const first = await importBackup(backup, actor.id, "local-full-backup.json", target);
    pass(first.companies?.created === before.companies && first.media?.created === before.media && first.exhibitions.created === before.exhibitions, "All main sections restored into the isolated database");
    pass(await target.companyContact.count() === before.contacts && await target.mediaContact.count() === backup.data.media.reduce((sum, v) => sum + v.contacts.length, 0), "All Company and Media contacts restored");
    const roundTrip = await createExport(actor.id, target); assert.equal(roundTrip.version, 2); if (roundTrip.version !== 2) throw new Error("Full backup required");
    const targetUsers = await target.user.findMany({ select: { id: true, username: true } });
    const userMap = new Map(backup.data.administration.users.map(u => [u.id, targetUsers.find(t => t.username.toLowerCase() === u.username.toLowerCase())!.id]));
    function normalize<T>(value: T): T {
      return JSON.parse(JSON.stringify(value), (key, field) => ["createdById", "updatedById", "preEventEmailSentById", "postEventEmailSentById", "startedById", "actorUserId"].includes(key) && field ? userMap.get(field) ?? field : field);
    }
    function sorted(value: unknown): unknown {
      if (Array.isArray(value)) return value.map(sorted).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
      if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, sorted(v)]));
      return value;
    }
    for (const key of ["companies", "media", "exhibitions", "companyFolders", "categories", "topics"] as const) {
      assert.deepEqual(sorted(roundTrip.data[key]), sorted(normalize(backup.data[key])), `${key} data loss`);
      pass(true, `${key}: full nested field / relationship / saved-state round trip matches`);
    }
    const account = await target.user.findUniqueOrThrow({ where: { id: actor.id }, include: { permissions: true } });
    pass(account.passwordHash === hash && account.role === "ADMIN" && account.isActive && !account.mustChangePassword && account.permissions.length === 0, "Existing administrator password and permissions are untouched");
    pass(await target.user.count({ where: { id: { not: actor.id }, OR: [{ isActive: true }, { mustChangePassword: false }] } }) === 0 && await target.session.count() === 0, "Restored users are disabled and no sessions are restored");
    pass(await target.auditLog.count({ where: { id: { in: backup.data.administration.auditLogs.map(v => v.id) }, description: { startsWith: "[Imported history] " } } }) === backup.data.administration.auditLogs.length, "Activity history restored and visibly labelled as imported");
    const second = await importBackup(backup, actor.id, "same-backup.json", target);
    pass(second.companies?.created === 0 && second.media?.created === 0 && second.exhibitions.created === 0 && second.auditLogs?.created === 0 && await target.companyContact.count() === before.contacts, "Repeated restore does not duplicate parents, contacts or activity history");
    const fixture = fullBackup();
    await importBackup(fixture, actor.id, "synthetic-relationships.json", target);
    pass(await target.companyExhibition.count({ where: { companyId: "company-1", exhibitionId: "expo-1" } }) === 1 && await target.companyFolderMembership.count({ where: { companyId: "company-1", folderId: "folder-1" } }) === 1, "Synthetic folder, linked exhibition and saved records restore together");
    // Break a late foreign key AFTER initial writes; the entire restore must roll back.
    const failure = structuredClone(fixture); failure.data.companies[0].name = "Must never persist"; failure.data.media[0].sources[0].importJobId = "missing-job";
    await assert.rejects(() => importBackup(failure, actor.id, "must-rollback.json", target));
    pass((await target.company.findUniqueOrThrow({ where: { id: "company-1" } })).name === "Example Company", "A late restore failure rolls back earlier Company changes");
    const legacy: Extract<ReturnType<typeof parseBackupText>, { version: 1 }> = { format: backup.format, version: 1, exportedAt: backup.exportedAt, data: { categories: [], topics: [], exhibitions: [] } };
    const countBeforeLegacy = await target.company.count();
    await importBackup(legacy, actor.id, "legacy-v1.json", target);
    pass(await target.company.count() === countBeforeLegacy && await target.mediaOutlet.count() === before.media + 1, "Legacy v1 import preserves Company and Media sections");
    // A natural-key remap must propagate through CompanyExhibition and folders.
    const remap: FullBackupDocument = structuredClone(fixture);
    remap.data.exhibitions[0].id = "source-expo-remapped"; remap.data.companies[0].exhibitions[0].exhibitionId = "source-expo-remapped";
    remap.data.companyFolders[0].id = "source-folder-remapped"; remap.data.companies[0].folders[0].folderId = "source-folder-remapped";
    await importBackup(remap, actor.id, "remap.json", target);
    pass(await target.companyExhibition.count({ where: { companyId: "company-1", exhibitionId: "expo-1" } }) === 1 && await target.companyFolder.count({ where: { normalizedName: "rov" } }) === 1, "Existing slug and folder identities remap references without duplicates");
    const after = { companies: await prisma.company.count(), contacts: await prisma.companyContact.count(), media: await prisma.mediaOutlet.count(), exhibitions: await prisma.exhibition.count(), users: await prisma.user.count() };
    assert.deepEqual(after, before); pass(true, "Actual source data is unchanged; imports were isolated");
    const summary = { checks, records: before, folders: backup.data.companyFolders.length, mediaContacts: backup.data.media.reduce((sum, v) => sum + v.contacts.length, 0), auditLogs: backup.data.administration.auditLogs.length, savedCompanies: backup.data.companies.filter(v => v.saved).length, savedExhibitions: backup.data.exhibitions.filter(v => v.saved).length };
    await writeFile("outputs/full-backup-verification/result.json", JSON.stringify(summary, null, 2), { mode: 0o600 });
    console.log(JSON.stringify(summary));
  } finally {
    await target.$disconnect();
    // Exact random database created by this run only; never DROP the source or any pre-existing database.
    if (created && /^iec_backup_verify_[a-f0-9]{16}$/.test(name) && targetUrl.pathname === `/${name}` && sourceUrl.pathname === "/iec_expobot") await prisma.$executeRawUnsafe(`DROP DATABASE "${name}"`);
  }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Backup integration failed"); process.exitCode = 1; }).finally(() => prisma.$disconnect());
