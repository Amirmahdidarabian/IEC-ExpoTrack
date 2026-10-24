import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/auth/errors";
import { BACKUP_FORMAT, BACKUP_VERSION, parseBackupText, type BackupDocument, type FullBackupDocument } from "./schema";
import { exportFullData, importFullData, importUserProfiles } from "./full-service";

export type ImportPreview = {
  formatVersion: number;
  exportedAt: string;
  exhibitions: number;
  categories: number;
  topics: number;
  newRecords: number;
  existingRecords: number;
  invalidRecords: 0;
  warnings: string[];
  companies: number;
  companyFolders: number;
  companyContacts: number;
  media: number;
  mediaContacts: number;
  users: number;
  auditLogs: number;
  importJobs: number;
  savedCompanies: number;
  savedExhibitions: number;
};

export async function createExport(actorId: string, client = prisma): Promise<BackupDocument> {
  return client.$transaction(async (tx) => {
    const [categories, topics, exhibitions] = await Promise.all([
      tx.industryCategory.findMany({ orderBy: { name: "asc" } }),
      tx.topic.findMany({ orderBy: { name: "asc" } }),
      tx.exhibition.findMany({ orderBy: { createdAt: "asc" }, include: { categories: true, topicLinks: true, sources: { orderBy: { priority: "asc" } } } }),
    ]);
    const fullData = await exportFullData(tx);
    const backup: FullBackupDocument = {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      data: {
        ...fullData,
        categories: categories.map((item) => ({ ...item, createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString() })),
        topics: topics.map((item) => ({ ...item, createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString() })),
        exhibitions: exhibitions.map((item) => ({
          id: item.id, slug: item.slug, name: item.name, tagline: item.tagline, industry: item.industry, eventType: item.eventType,
          createdById: item.createdById ?? null, updatedById: item.updatedById ?? null, preEventEmailSentById: item.preEventEmailSentById ?? null, postEventEmailSentById: item.postEventEmailSentById ?? null,
          country: item.country, countryCode: item.countryCode, city: item.city, venue: item.venue, address: item.address,
          startDate: item.startDate.toISOString(), endDate: item.endDate?.toISOString() ?? null, timezone: item.timezone,
          organizer: item.organizer, website: item.website, description: item.description, aiReport: item.aiReport,
          topics: Array.isArray(item.topics) ? item.topics.filter((value): value is string => typeof value === "string") : [], saved: item.saved, exhibitorList: item.exhibitorList, exhibitorListUrl: item.exhibitorListUrl,
          exhibitorListWithLink: Boolean(item.exhibitorListWithLink), visitorMessaging: Boolean(item.visitorMessaging),
          preEventEmailSent: item.preEventEmailSent, preEventEmailSentAt: item.preEventEmailSentAt?.toISOString() ?? null,
          postEventEmailSent: item.postEventEmailSent, postEventEmailSentAt: item.postEventEmailSentAt?.toISOString() ?? null,
          createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString(),
          categoryIds: item.categories.map((link) => link.categoryId), topicIds: item.topicLinks.map((link) => link.topicId),
          sources: item.sources.map((source) => ({ id: source.id, label: source.label, url: source.url, lastChecked: source.lastChecked.toISOString(), priority: source.priority })),
        })),
      },
    };
    await tx.auditLog.create({ data: {
      actorUserId: actorId, action: "EXPORT_DATA", entityType: "SYSTEM", description: "Exported full IEC application backup",
      metadata: { formatVersion: BACKUP_VERSION, exhibitions: exhibitions.length, categories: categories.length, topics: topics.length, companies: fullData.companies.length, media: fullData.media.length, users: fullData.administration.users.length },
    } });
    // Never hand the user a backup that this application cannot import (including the size limit).
    return parseBackupText(JSON.stringify(backup, null, 2));
  }, { isolationLevel: "RepeatableRead", maxWait: 5_000, timeout: 120_000 });
}

async function findExisting(backup: BackupDocument, client: typeof prisma | Prisma.TransactionClient = prisma) {
  const [categories, topics, exhibitions] = await Promise.all([
    client.industryCategory.findMany({ where: { OR: [{ id: { in: backup.data.categories.map((item) => item.id) } }, { normalizedName: { in: backup.data.categories.map((item) => item.normalizedName) } }, { slug: { in: backup.data.categories.map((item) => item.slug) } }] }, select: { id: true, normalizedName: true, slug: true } }),
    client.topic.findMany({ where: { OR: [{ id: { in: backup.data.topics.map((item) => item.id) } }, { normalizedName: { in: backup.data.topics.map((item) => item.normalizedName) } }, { slug: { in: backup.data.topics.map((item) => item.slug) } }] }, select: { id: true, normalizedName: true, slug: true } }),
    client.exhibition.findMany({ where: { OR: [{ id: { in: backup.data.exhibitions.map((item) => item.id) } }, { slug: { in: backup.data.exhibitions.map((item) => item.slug) } }] }, select: { id: true, slug: true } }),
  ]);
  return { categories, topics, exhibitions };
}

export async function previewImport(backup: BackupDocument): Promise<ImportPreview> {
  const existing = await findExisting(backup);
  let existingRecords = backup.data.categories.filter((item) => taxonomyMatch(item, existing.categories)).length
    + backup.data.topics.filter((item) => taxonomyMatch(item, existing.topics)).length
    + backup.data.exhibitions.filter((item) => existing.exhibitions.some((row) => row.id === item.id || row.slug === item.slug)).length;
  let total = backup.data.categories.length + backup.data.topics.length + backup.data.exhibitions.length;
  const conflicts = backup.data.exhibitions.filter((item) => existing.exhibitions.some((row) => row.slug === item.slug && row.id !== item.id)).slice(0, 8);
  const warnings = conflicts.map((item) => `${item.name} matches an existing exhibition by slug and will be updated.`);
  const counts = { companies: 0, companyFolders: 0, companyContacts: 0, media: 0, mediaContacts: 0, users: 0, auditLogs: 0, importJobs: 0, savedCompanies: 0, savedExhibitions: backup.data.exhibitions.filter(v => v.saved).length };
  if (backup.version === 2) {
    const { companies, companyFolders, media, administration } = backup.data;
    const [companyRows, folderRows, mediaRows, userRows] = await Promise.all([
      prisma.company.findMany({ where: { id: { in: companies.map(v => v.id) } }, select: { id: true } }),
      prisma.companyFolder.findMany({ where: { OR: [{ id: { in: companyFolders.map(v => v.id) } }, { normalizedName: { in: companyFolders.map(v => v.normalizedName) } }] }, select: { id: true, normalizedName: true } }),
      prisma.mediaOutlet.findMany({ where: { OR: [{ id: { in: media.map(v => v.id) } }, { identityKey: { in: media.flatMap(v => v.identityKey ? [v.identityKey] : []) } }] }, select: { id: true, identityKey: true } }),
      prisma.user.findMany({ select: { id: true, username: true } }),
    ]);
    existingRecords += companyRows.length + companyFolders.filter(v => folderRows.some(f => f.id === v.id || f.normalizedName === v.normalizedName)).length + media.filter(v => mediaRows.some(m => m.id === v.id || Boolean(v.identityKey && m.identityKey === v.identityKey))).length + administration.users.filter(v => userRows.some(u => u.id === v.id || u.username.toLowerCase() === v.username.toLowerCase())).length;
    total += companies.length + companyFolders.length + media.length + administration.users.length;
    Object.assign(counts, { companies: companies.length, companyFolders: companyFolders.length, companyContacts: companies.reduce((sum, v) => sum + v.contacts.length, 0), media: media.length, mediaContacts: media.reduce((sum, v) => sum + v.contacts.length, 0), users: administration.users.length, auditLogs: administration.auditLogs.length, importJobs: administration.companyImportJobs.length + administration.mediaImportJobs.length, savedCompanies: companies.filter(v => v.saved).length });
    warnings.push("Included records and their contacts, notes, links and classifications will be restored from this snapshot. Parent records absent from the file are retained. Export a fresh backup first.", "Existing accounts, passwords and permissions stay unchanged. New user profiles are DISABLED and require an administrator to reset their password and enable them.", "Activity history is labelled as imported. Environment files, credentials, sessions, server configuration and browser diagnostics are not included.");
  } else warnings.push("Legacy version 1: only exhibitions, categories and topics are included. Companies, Media, user accounts and activity history are NOT in this file and will not be changed.");
  return {
    ...counts,
    formatVersion: backup.version, exportedAt: backup.exportedAt,
    exhibitions: backup.data.exhibitions.length, categories: backup.data.categories.length, topics: backup.data.topics.length,
    newRecords: total - existingRecords, existingRecords, invalidRecords: 0,
    warnings,
  };
}

function taxonomyMatch<T extends { id: string; normalizedName: string; slug: string }>(item: T, rows: T[]) {
  const matches = rows.filter(row => row.id === item.id || row.normalizedName === item.normalizedName || row.slug === item.slug);
  if (matches.length > 1) throw new HttpError("Conflicting taxonomy identities. Import cancelled without changes.", 409);
  return matches[0];
}

function mapIdentity(map: Map<string, string>, source: string, target: string) {
  if ([...map.entries()].some(([key, value]) => key !== source && value === target)) throw new HttpError("Two backup records resolve to one existing identity. Import cancelled.", 409);
  map.set(source, target);
}

export async function importBackup(backup: BackupDocument, actorId: string, filename: string, client = prisma) {
  return client.$transaction(async (tx) => {
    // Serialize application backup restores; an error rolls back the entire dataset and audit write.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('iec-full-backup-import'))`;
    const existing = await findExisting(backup, tx);
    const categoryMap = new Map<string, string>();
    const topicMap = new Map<string, string>();
    const exhibitionMap = new Map<string, string>();
    const userMap = backup.version === 2 ? await importUserProfiles(tx, backup.data.administration.users) : new Map<string, string>();
    let categoriesCreated = 0; let categoriesUpdated = 0; let topicsCreated = 0; let topicsUpdated = 0;
    for (const item of backup.data.categories) {
      const match = taxonomyMatch(item, existing.categories);
      mapIdentity(categoryMap, item.id, match?.id ?? item.id);
      if (match) { await tx.industryCategory.update({ where: { id: match.id }, data: { name: item.name, normalizedName: item.normalizedName, slug: item.slug, createdAt: new Date(item.createdAt), updatedAt: new Date(item.updatedAt) } }); categoryMap.set(item.id, match.id); categoriesUpdated++; }
      else { await tx.industryCategory.create({ data: { ...item, createdAt: new Date(item.createdAt), updatedAt: new Date(item.updatedAt) } }); categoryMap.set(item.id, item.id); categoriesCreated++; }
    }
    for (const item of backup.data.topics) {
      const match = taxonomyMatch(item, existing.topics);
      mapIdentity(topicMap, item.id, match?.id ?? item.id);
      if (match) { await tx.topic.update({ where: { id: match.id }, data: { name: item.name, normalizedName: item.normalizedName, slug: item.slug, createdAt: new Date(item.createdAt), updatedAt: new Date(item.updatedAt) } }); topicMap.set(item.id, match.id); topicsUpdated++; }
      else { await tx.topic.create({ data: { ...item, createdAt: new Date(item.createdAt), updatedAt: new Date(item.updatedAt) } }); topicMap.set(item.id, item.id); topicsCreated++; }
    }
    let exhibitionsCreated = 0; let exhibitionsUpdated = 0;
    for (const item of backup.data.exhibitions) {
      const matches = existing.exhibitions.filter(row => row.id === item.id || row.slug === item.slug);
      if (matches.length > 1) throw new HttpError("Conflicting exhibition identities. Import cancelled without changes.", 409);
      const match = matches[0];
      mapIdentity(exhibitionMap, item.id, match?.id ?? item.id);
      const scalar = {
        slug: item.slug, name: item.name, tagline: item.tagline, industry: item.industry, eventType: item.eventType,
        country: item.country, countryCode: item.countryCode, city: item.city, venue: item.venue, address: item.address,
        startDate: new Date(item.startDate), endDate: item.endDate ? new Date(item.endDate) : null, timezone: item.timezone,
        organizer: item.organizer, website: item.website, description: item.description, aiReport: item.aiReport,
        topics: item.topics, saved: item.saved, exhibitorList: item.exhibitorList, exhibitorListUrl: item.exhibitorListUrl,
        exhibitorListWithLink: item.exhibitorListWithLink, visitorMessaging: item.visitorMessaging,
        preEventEmailSent: item.preEventEmailSent, preEventEmailSentAt: item.preEventEmailSentAt ? new Date(item.preEventEmailSentAt) : null,
        postEventEmailSent: item.postEventEmailSent, postEventEmailSentAt: item.postEventEmailSentAt ? new Date(item.postEventEmailSentAt) : null,
        createdAt: new Date(item.createdAt), updatedAt: new Date(item.updatedAt),
      } satisfies Prisma.ExhibitionUpdateInput;
      const sources = item.sources.map((source) => ({ id: source.id, label: source.label, url: source.url, lastChecked: new Date(source.lastChecked), priority: source.priority }));
      const categories = item.categoryIds.map((categoryId) => ({ categoryId: categoryMap.get(categoryId)! }));
      const topicLinks = item.topicIds.map((topicId) => ({ topicId: topicMap.get(topicId)! }));
      const actors: Prisma.ExhibitionUpdateInput = backup.version === 2 && "createdById" in item ? Object.fromEntries((["createdBy", "updatedBy", "preEventEmailSentBy", "postEventEmailSentBy"] as const).map(key => { const sourceId = item[`${key}Id`]; const mapped = sourceId ? userMap.get(sourceId) : undefined; return [key, mapped ? { connect: { id: mapped } } : { disconnect: true }]; })) : { updatedBy: { connect: { id: actorId } }, preEventEmailSentBy: { disconnect: true }, postEventEmailSentBy: { disconnect: true } };
      if (match) {
        await tx.exhibition.update({ where: { id: match.id }, data: { ...scalar, ...actors, sources: { deleteMany: {}, create: sources }, categories: { deleteMany: {}, create: categories }, topicLinks: { deleteMany: {}, create: topicLinks } } }); exhibitionsUpdated++;
      } else {
        const actorLinks = backup.version === 2 && "createdById" in item ? { createdBy: item.createdById ? { connect: { id: userMap.get(item.createdById)! } } : undefined, updatedBy: item.updatedById ? { connect: { id: userMap.get(item.updatedById)! } } : undefined, preEventEmailSentBy: item.preEventEmailSentById ? { connect: { id: userMap.get(item.preEventEmailSentById)! } } : undefined, postEventEmailSentBy: item.postEventEmailSentById ? { connect: { id: userMap.get(item.postEventEmailSentById)! } } : undefined } : { createdBy: { connect: { id: actorId } }, updatedBy: { connect: { id: actorId } } };
        await tx.exhibition.create({ data: { ...scalar, id: item.id, ...actorLinks, sources: { create: sources }, categories: { create: categories }, topicLinks: { create: topicLinks } } }); exhibitionsCreated++;
      }
    }
    const result = {
      ...(backup.version === 2 ? await importFullData(tx, backup, userMap, categoryMap, topicMap, exhibitionMap) : {}),
      exhibitions: { processed: backup.data.exhibitions.length, created: exhibitionsCreated, updated: exhibitionsUpdated, skipped: 0 },
      categories: { processed: backup.data.categories.length, created: categoriesCreated, updated: categoriesUpdated },
      topics: { processed: backup.data.topics.length, created: topicsCreated, updated: topicsUpdated },
      errors: 0,
    };
    await tx.auditLog.create({ data: {
      actorUserId: actorId, action: "IMPORT_DATA", entityType: "SYSTEM", description: backup.version === 2 ? "Restored full IEC application backup" : "Imported legacy IEC exhibition backup",
      metadata: { filename, formatVersion: backup.version, numberOfExhibitions: backup.data.exhibitions.length, numberOfCategories: backup.data.categories.length, numberOfTopics: backup.data.topics.length, numberCreated: exhibitionsCreated, numberUpdated: exhibitionsUpdated, numberSkipped: 0, companies: backup.version === 2 ? backup.data.companies.length : 0, media: backup.version === 2 ? backup.data.media.length : 0 },
    } });
    return result;
  }, { maxWait: 5_000, timeout: 120_000 });
}
