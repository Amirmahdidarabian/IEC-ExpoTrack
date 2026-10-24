import { randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { HttpError } from "@/lib/auth/errors";
import type { FullBackupDocument } from "./schema";
import { folderSchema } from "@/lib/companies/folder-schema";

type Client = Prisma.TransactionClient;
type FullData = FullBackupDocument["data"];

/** Extra JSON fields are data, never an escape hatch for authentication material. */
type Json = string | number | boolean | null | Json[] | { [key: string]: Json };
export function sanitizeBackupJson(value: unknown): Json {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    if (/\b(?:postgres(?:ql)?|mysql|redis):\/\/|\bscrypt\$|-----BEGIN [\w ]*PRIVATE KEY-----/i.test(value)) return "[REDACTED]";
    return value;
  }
  if (typeof value === "boolean" || typeof value === "number") return value;
  if (Array.isArray(value)) return value.map(sanitizeBackupJson);
  if (typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([key]) => !/^(?:__proto__|prototype|constructor)$/.test(key)).map(([key, item]) => [key, /password|passphrase|secret|token|cookie|authorization|api[_-]?key|private[_-]?key|database[_-]?url|connection[_-]?string/i.test(key) ? "[REDACTED]" : sanitizeBackupJson(item)]));
  return null;
}
function dbJson(value: unknown) { return sanitizeBackupJson(value) ?? Prisma.DbNull; }
function dated<T extends { createdAt: string; updatedAt: string }>(value: T) { return { ...value, createdAt: new Date(value.createdAt), updatedAt: new Date(value.updatedAt) }; }
function omit<T, K extends keyof T>(value: T, key: K): Omit<T, K> { const copy = { ...value }; delete copy[key]; return copy; }
function mapUser(map: Map<string, string>, value: string | null) { return value ? map.get(value) ?? null : null; }

export async function exportFullData(tx: Client): Promise<Omit<FullData, "categories" | "topics" | "exhibitions">> {
  const [companyFolders, companies, media, users, auditLogs, companyImportJobs, mediaImportJobs] = await Promise.all([
    tx.companyFolder.findMany({ orderBy: { id: "asc" } }),
    tx.company.findMany({ orderBy: { id: "asc" }, include: { contacts: true, socialLinks: true, categories: true, topics: true, exhibitions: true, notes: true, folders: true } }),
    tx.mediaOutlet.findMany({ orderBy: { id: "asc" }, include: { contacts: { orderBy: { position: "asc" } }, socialLinks: true, categories: true, topics: true, notes: true, sources: true } }),
    // Deliberately never fetch password hashes or sessions.
    tx.user.findMany({ orderBy: { id: "asc" }, select: { id: true, username: true, role: true, isActive: true, mustChangePassword: true, createdAt: true, updatedAt: true, lastLoginAt: true, permissions: { select: { permission: true } } } }),
    tx.auditLog.findMany({ orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
    tx.companyImportJob.findMany({ orderBy: { id: "asc" } }),
    tx.mediaImportJob.findMany({ orderBy: { id: "asc" } }),
  ]);
  const dates = <T extends { createdAt: Date; updatedAt: Date }>(v: T) => ({ ...v, createdAt: v.createdAt.toISOString(), updatedAt: v.updatedAt.toISOString() });
  return {
    companyFolders: companyFolders.map(v => ({ ...dates(v), color: folderSchema.shape.color.parse(v.color) })),
    companies: companies.map(({ contacts, socialLinks, categories, topics, exhibitions, notes, folders, ...v }) => ({
      ...dates(v), categoryIds: categories.map(c => c.categoryId), topicIds: topics.map(t => t.topicId),
      contacts: contacts.map(c => dates(omit(c, "companyId"))),
      socialLinks: socialLinks.map(({ id, platform, url }) => ({ id, platform, url })),
      notes: notes.map(n => dates(omit(n, "companyId"))),
      exhibitions: exhibitions.map(e => ({ ...omit(e, "companyId"), createdAt: e.createdAt.toISOString() })),
      folders: folders.map(f => ({ folderId: f.folderId, createdAt: f.createdAt.toISOString() })),
    })),
    media: media.map(({ contacts, socialLinks, categories, topics, notes, sources, ...v }) => ({
      ...dates(v), categoryIds: categories.map(c => c.categoryId), topicIds: topics.map(t => t.topicId),
      contacts: contacts.map(c => dates(omit(c, "mediaOutletId"))),
      socialLinks: socialLinks.map(({ id, platform, url }) => ({ id, platform, url })),
      notes: notes.map(n => dates(omit(n, "mediaOutletId"))),
      sources: sources.map(s => ({ ...omit(s, "mediaOutletId"), rawValues: sanitizeBackupJson(s.rawValues), warnings: sanitizeBackupJson(s.warnings) })),
    })),
    administration: {
      users: users.map(({ permissions, lastLoginAt, ...v }) => ({ ...dates(v), lastLoginAt: lastLoginAt?.toISOString() ?? null, permissions: permissions.map(p => p.permission) })),
      auditLogs: auditLogs.map(v => ({ ...v, metadata: sanitizeBackupJson(v.metadata), createdAt: v.createdAt.toISOString() })),
      companyImportJobs: companyImportJobs.map(v => ({ ...v, startedAt: v.startedAt.toISOString(), completedAt: v.completedAt?.toISOString() ?? null, errorSummary: sanitizeBackupJson(v.errorSummary) })),
      mediaImportJobs: mediaImportJobs.map(v => ({ ...v, startedAt: v.startedAt.toISOString(), completedAt: v.completedAt?.toISOString() ?? null, report: sanitizeBackupJson(v.report) })),
    },
  };
}

/** A backup cannot grant access to an existing account, change its password, or revive a session. */
export async function importUserProfiles(tx: Client, users: FullData["administration"]["users"]) {
  const map = new Map<string, string>();
  for (const user of users) {
    const rows = await tx.user.findMany({ where: { OR: [{ id: user.id }, { username: { equals: user.username, mode: "insensitive" } }] }, select: { id: true, username: true } });
    if (rows.length > 1 || (rows[0]?.id === user.id && rows[0].username.toLowerCase() !== user.username.toLowerCase())) throw new HttpError("A user identity conflicts with an existing account. Import cancelled without changes.", 409);
    if (rows[0]) { map.set(user.id, rows[0].id); continue; }
    const { permissions, lastLoginAt, ...profile } = user;
    await tx.user.create({ data: { ...dated(profile), lastLoginAt: lastLoginAt ? new Date(lastLoginAt) : null,
      // Not a supported password encoding, and the random value is never returned or logged.
      passwordHash: `!disabled-backup-${randomBytes(32).toString("hex")}`, isActive: false, mustChangePassword: true,
      permissions: { create: permissions.map(permission => ({ permission })) },
    } });
    map.set(user.id, user.id);
  }
  return map;
}

export type RecordCounts = { processed: number; created: number; updated: number };
export const recordCounts = (processed = 0): RecordCounts => ({ processed, created: 0, updated: 0 });

export async function importFullData(tx: Client, backup: FullBackupDocument, userMap: Map<string, string>, categoryMap: Map<string, string>, topicMap: Map<string, string>, exhibitionMap: Map<string, string>) {
  const { companyFolders, companies, media, administration } = backup.data;
  const result = { companyFolders: recordCounts(companyFolders.length), companies: recordCounts(companies.length), media: recordCounts(media.length), users: { processed: administration.users.length }, auditLogs: { processed: administration.auditLogs.length, created: 0, skipped: 0 }, companyImportJobs: recordCounts(administration.companyImportJobs.length), mediaImportJobs: recordCounts(administration.mediaImportJobs.length) };
  const folderMap = new Map<string, string>();
  for (const item of companyFolders) {
    const rows = await tx.companyFolder.findMany({ where: { OR: [{ id: item.id }, { normalizedName: item.normalizedName }] }, select: { id: true } });
    if (rows.length > 1) throw new HttpError("Conflicting company folder identities. Import cancelled.", 409);
    const target = rows[0]?.id ?? item.id; folderMap.set(item.id, target);
    if ([...folderMap.entries()].some(([key, value]) => key !== item.id && value === target)) throw new HttpError("Two folders resolve to one existing identity. Import cancelled.", 409);
    const fields = omit(dated(item), "id");
    await tx.companyFolder.upsert({ where: { id: target }, create: { id: target, ...fields }, update: fields });
    result.companyFolders[rows.length ? "updated" : "created"]++;
  }
  for (const item of administration.companyImportJobs) {
    const { errorSummary, ...fields } = item;
    const value = { ...fields, startedById: mapUser(userMap, item.startedById), startedAt: new Date(item.startedAt), completedAt: item.completedAt ? new Date(item.completedAt) : null, errorSummary: dbJson(errorSummary) };
    const existing = await tx.companyImportJob.findUnique({ where: { id: item.id }, select: { id: true } });
    // Import history is immutable. It never starts or re-runs a job.
    if (!existing) await tx.companyImportJob.create({ data: value });
    result.companyImportJobs[existing ? "updated" : "created"]++;
  }
  for (const item of administration.mediaImportJobs) {
    const value = { ...item, startedById: mapUser(userMap, item.startedById), startedAt: new Date(item.startedAt), completedAt: item.completedAt ? new Date(item.completedAt) : null, report: dbJson(item.report) };
    const existing = await tx.mediaImportJob.findUnique({ where: { id: item.id }, select: { id: true } });
    if (!existing) await tx.mediaImportJob.create({ data: value });
    result.mediaImportJobs[existing ? "updated" : "created"]++;
  }
  for (const item of companies) {
    const { id, contacts, socialLinks, notes, folders, exhibitions, categoryIds, topicIds, ...fields } = dated(item);
    const existing = await tx.company.findUnique({ where: { id }, select: { id: true } });
    const scalar = { ...fields, createdById: mapUser(userMap, item.createdById) };
    await tx.company.upsert({ where: { id }, create: { id, ...scalar }, update: scalar });
    // Only children belonging to this included parent are replaced; a colliding foreign child ID aborts the transaction.
    await tx.companyContact.deleteMany({ where: { companyId: id } });
    await tx.companySocialLink.deleteMany({ where: { companyId: id } });
    await tx.companyNote.deleteMany({ where: { companyId: id } });
    await tx.companyExhibition.deleteMany({ where: { companyId: id } });
    await tx.companyFolderMembership.deleteMany({ where: { companyId: id } });
    await tx.companyCategory.deleteMany({ where: { companyId: id } });
    await tx.companyTopic.deleteMany({ where: { companyId: id } });
    if (contacts.length) await tx.companyContact.createMany({ data: contacts.map(c => ({ ...dated(c), companyId: id })) });
    if (socialLinks.length) await tx.companySocialLink.createMany({ data: socialLinks.map(s => ({ ...s, companyId: id })) });
    if (notes.length) await tx.companyNote.createMany({ data: notes.map(n => ({ ...dated(n), companyId: id, createdById: mapUser(userMap, n.createdById) })) });
    if (exhibitions.length) await tx.companyExhibition.createMany({ data: exhibitions.map(e => ({ ...e, companyId: id, exhibitionId: exhibitionMap.get(e.exhibitionId)!, createdAt: new Date(e.createdAt) })) });
    if (folders.length) await tx.companyFolderMembership.createMany({ data: folders.map(f => ({ companyId: id, folderId: folderMap.get(f.folderId)!, createdAt: new Date(f.createdAt) })), skipDuplicates: true });
    if (categoryIds.length) await tx.companyCategory.createMany({ data: categoryIds.map(c => ({ companyId: id, categoryId: categoryMap.get(c)! })), skipDuplicates: true });
    if (topicIds.length) await tx.companyTopic.createMany({ data: topicIds.map(t => ({ companyId: id, topicId: topicMap.get(t)! })), skipDuplicates: true });
    result.companies[existing ? "updated" : "created"]++;
  }
  const mediaTargets = new Set<string>();
  for (const item of media) {
    const rows = await tx.mediaOutlet.findMany({ where: { OR: [{ id: item.id }, ...(item.identityKey ? [{ identityKey: item.identityKey }] : [])] }, select: { id: true } });
    if (rows.length > 1) throw new HttpError("Conflicting media identities. Import cancelled.", 409);
    const target = rows[0]?.id ?? item.id;
    if (mediaTargets.has(target)) throw new HttpError("Two media records resolve to one existing identity. Import cancelled.", 409);
    mediaTargets.add(target);
    const { contacts, socialLinks, notes, sources, categoryIds, topicIds, ...fields } = omit(dated(item), "id");
    const scalar = { ...fields, createdById: mapUser(userMap, item.createdById) };
    await tx.mediaOutlet.upsert({ where: { id: target }, create: { id: target, ...scalar }, update: scalar });
    await tx.mediaContact.deleteMany({ where: { mediaOutletId: target } });
    await tx.mediaSocialLink.deleteMany({ where: { mediaOutletId: target } });
    await tx.mediaNote.deleteMany({ where: { mediaOutletId: target } });
    await tx.mediaImportSource.deleteMany({ where: { mediaOutletId: target } });
    await tx.mediaCategory.deleteMany({ where: { mediaOutletId: target } });
    await tx.mediaTopic.deleteMany({ where: { mediaOutletId: target } });
    if (contacts.length) await tx.mediaContact.createMany({ data: contacts.map(c => ({ ...dated(c), mediaOutletId: target })) });
    if (socialLinks.length) await tx.mediaSocialLink.createMany({ data: socialLinks.map(s => ({ ...s, mediaOutletId: target })) });
    if (notes.length) await tx.mediaNote.createMany({ data: notes.map(n => ({ ...dated(n), mediaOutletId: target, createdById: mapUser(userMap, n.createdById) })) });
    if (sources.length) await tx.mediaImportSource.createMany({ data: sources.map(s => ({ ...s, mediaOutletId: target, rawValues: sanitizeBackupJson(s.rawValues) ?? Prisma.JsonNull, warnings: sanitizeBackupJson(s.warnings) ?? Prisma.JsonNull })) });
    if (categoryIds.length) await tx.mediaCategory.createMany({ data: categoryIds.map(c => ({ mediaOutletId: target, categoryId: categoryMap.get(c)! })), skipDuplicates: true });
    if (topicIds.length) await tx.mediaTopic.createMany({ data: topicIds.map(t => ({ mediaOutletId: target, topicId: topicMap.get(t)! })), skipDuplicates: true });
    result.media[rows.length ? "updated" : "created"]++;
  }
  for (const log of administration.auditLogs) {
    if (await tx.auditLog.findUnique({ where: { id: log.id }, select: { id: true } })) { result.auditLogs.skipped++; continue; }
    // Clearly label uploaded history instead of presenting it as a new trusted local action.
    const description = log.description.startsWith("[Imported history] ") ? log.description : `[Imported history] ${log.description}`;
    await tx.auditLog.create({ data: { ...log, description, actorUserId: mapUser(userMap, log.actorUserId), createdAt: new Date(log.createdAt), metadata: { importedHistory: true, sourceMetadata: sanitizeBackupJson(log.metadata) } } });
    result.auditLogs.created++;
  }
  return result;
}
