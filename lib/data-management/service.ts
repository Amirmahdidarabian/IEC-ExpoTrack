import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { BACKUP_FORMAT, BACKUP_VERSION, type BackupDocument } from "./schema";

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
};

export async function createExport(actorId: string): Promise<BackupDocument> {
  return prisma.$transaction(async (tx) => {
    const [categories, topics, exhibitions] = await Promise.all([
      tx.industryCategory.findMany({ orderBy: { name: "asc" } }),
      tx.topic.findMany({ orderBy: { name: "asc" } }),
      tx.exhibition.findMany({ orderBy: { createdAt: "asc" }, include: { categories: true, topicLinks: true, sources: { orderBy: { priority: "asc" } } } }),
    ]);
    const backup: BackupDocument = {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      data: {
        categories: categories.map((item) => ({ ...item, createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString() })),
        topics: topics.map((item) => ({ ...item, createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString() })),
        exhibitions: exhibitions.map((item) => ({
          id: item.id, slug: item.slug, name: item.name, tagline: item.tagline, industry: item.industry, eventType: item.eventType,
          country: item.country, countryCode: item.countryCode, city: item.city, venue: item.venue, address: item.address,
          startDate: item.startDate.toISOString(), endDate: item.endDate?.toISOString() ?? null, timezone: item.timezone,
          organizer: item.organizer, website: item.website, description: item.description, aiReport: item.aiReport,
          topics: Array.isArray(item.topics) ? item.topics.filter((value): value is string => typeof value === "string") : [], saved: item.saved,
          preEventEmailSent: item.preEventEmailSent, preEventEmailSentAt: item.preEventEmailSentAt?.toISOString() ?? null,
          postEventEmailSent: item.postEventEmailSent, postEventEmailSentAt: item.postEventEmailSentAt?.toISOString() ?? null,
          createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString(),
          categoryIds: item.categories.map((link) => link.categoryId), topicIds: item.topicLinks.map((link) => link.topicId),
          sources: item.sources.map((source) => ({ id: source.id, label: source.label, url: source.url, lastChecked: source.lastChecked.toISOString(), priority: source.priority })),
        })),
      },
    };
    await tx.auditLog.create({ data: {
      actorUserId: actorId, action: "EXPORT_DATA", entityType: "SYSTEM", description: "Exported IEC exhibition backup",
      metadata: { exhibitions: exhibitions.length, categories: categories.length, topics: topics.length },
    } });
    return backup;
  }, { isolationLevel: "RepeatableRead" });
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
  const existingRecords = backup.data.categories.filter((item) => taxonomyMatch(item, existing.categories)).length
    + backup.data.topics.filter((item) => taxonomyMatch(item, existing.topics)).length
    + backup.data.exhibitions.filter((item) => existing.exhibitions.some((row) => row.id === item.id || row.slug === item.slug)).length;
  const total = backup.data.categories.length + backup.data.topics.length + backup.data.exhibitions.length;
  const conflicts = backup.data.exhibitions.filter((item) => existing.exhibitions.some((row) => row.slug === item.slug && row.id !== item.id)).slice(0, 8);
  return {
    formatVersion: backup.version, exportedAt: backup.exportedAt,
    exhibitions: backup.data.exhibitions.length, categories: backup.data.categories.length, topics: backup.data.topics.length,
    newRecords: total - existingRecords, existingRecords, invalidRecords: 0,
    warnings: conflicts.map((item) => `${item.name} matches an existing exhibition by slug and will be updated.`),
  };
}

function taxonomyMatch<T extends { id: string; normalizedName: string; slug: string }>(item: T, rows: T[]) {
  return rows.find((row) => row.id === item.id) ?? rows.find((row) => row.normalizedName === item.normalizedName) ?? rows.find((row) => row.slug === item.slug);
}

export async function importBackup(backup: BackupDocument, actorId: string, filename: string) {
  return prisma.$transaction(async (tx) => {
    const existing = await findExisting(backup, tx);
    const categoryMap = new Map<string, string>();
    const topicMap = new Map<string, string>();
    let categoriesCreated = 0; let categoriesUpdated = 0; let topicsCreated = 0; let topicsUpdated = 0;
    for (const item of backup.data.categories) {
      const match = taxonomyMatch(item, existing.categories);
      if (match) { await tx.industryCategory.update({ where: { id: match.id }, data: { name: item.name, normalizedName: item.normalizedName, slug: item.slug, createdAt: new Date(item.createdAt), updatedAt: new Date(item.updatedAt) } }); categoryMap.set(item.id, match.id); categoriesUpdated++; }
      else { await tx.industryCategory.create({ data: { ...item, createdAt: new Date(item.createdAt), updatedAt: new Date(item.updatedAt) } }); categoryMap.set(item.id, item.id); categoriesCreated++; }
    }
    for (const item of backup.data.topics) {
      const match = taxonomyMatch(item, existing.topics);
      if (match) { await tx.topic.update({ where: { id: match.id }, data: { name: item.name, normalizedName: item.normalizedName, slug: item.slug, createdAt: new Date(item.createdAt), updatedAt: new Date(item.updatedAt) } }); topicMap.set(item.id, match.id); topicsUpdated++; }
      else { await tx.topic.create({ data: { ...item, createdAt: new Date(item.createdAt), updatedAt: new Date(item.updatedAt) } }); topicMap.set(item.id, item.id); topicsCreated++; }
    }
    let exhibitionsCreated = 0; let exhibitionsUpdated = 0;
    for (const item of backup.data.exhibitions) {
      const match = existing.exhibitions.find((row) => row.id === item.id) ?? existing.exhibitions.find((row) => row.slug === item.slug);
      const scalar = {
        slug: item.slug, name: item.name, tagline: item.tagline, industry: item.industry, eventType: item.eventType,
        country: item.country, countryCode: item.countryCode, city: item.city, venue: item.venue, address: item.address,
        startDate: new Date(item.startDate), endDate: item.endDate ? new Date(item.endDate) : null, timezone: item.timezone,
        organizer: item.organizer, website: item.website, description: item.description, aiReport: item.aiReport,
        topics: item.topics, saved: item.saved,
        preEventEmailSent: item.preEventEmailSent, preEventEmailSentAt: item.preEventEmailSentAt ? new Date(item.preEventEmailSentAt) : null,
        postEventEmailSent: item.postEventEmailSent, postEventEmailSentAt: item.postEventEmailSentAt ? new Date(item.postEventEmailSentAt) : null,
        createdAt: new Date(item.createdAt), updatedAt: new Date(item.updatedAt),
      } satisfies Prisma.ExhibitionUpdateInput;
      const sources = item.sources.map((source) => ({ label: source.label, url: source.url, lastChecked: new Date(source.lastChecked), priority: source.priority }));
      const categories = item.categoryIds.map((categoryId) => ({ categoryId: categoryMap.get(categoryId)! }));
      const topicLinks = item.topicIds.map((topicId) => ({ topicId: topicMap.get(topicId)! }));
      if (match) {
        await tx.exhibition.update({ where: { id: match.id }, data: { ...scalar, updatedBy: { connect: { id: actorId } }, preEventEmailSentBy: { disconnect: true }, postEventEmailSentBy: { disconnect: true }, sources: { deleteMany: {}, create: sources }, categories: { deleteMany: {}, create: categories }, topicLinks: { deleteMany: {}, create: topicLinks } } }); exhibitionsUpdated++;
      } else {
        await tx.exhibition.create({ data: { ...scalar, id: item.id, createdBy: { connect: { id: actorId } }, updatedBy: { connect: { id: actorId } }, sources: { create: sources }, categories: { create: categories }, topicLinks: { create: topicLinks } } }); exhibitionsCreated++;
      }
    }
    const result = {
      exhibitions: { processed: backup.data.exhibitions.length, created: exhibitionsCreated, updated: exhibitionsUpdated, skipped: 0 },
      categories: { processed: backup.data.categories.length, created: categoriesCreated, updated: categoriesUpdated },
      topics: { processed: backup.data.topics.length, created: topicsCreated, updated: topicsUpdated },
      errors: 0,
    };
    await tx.auditLog.create({ data: {
      actorUserId: actorId, action: "IMPORT_DATA", entityType: "SYSTEM", description: "Imported IEC exhibition backup",
      metadata: { filename, formatVersion: backup.version, numberOfExhibitions: backup.data.exhibitions.length, numberOfCategories: backup.data.categories.length, numberOfTopics: backup.data.topics.length, numberCreated: exhibitionsCreated, numberUpdated: exhibitionsUpdated, numberSkipped: 0 },
    } });
    return result;
  }, { maxWait: 5_000, timeout: 120_000 });
}
