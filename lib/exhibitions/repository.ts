import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { exhibitionSchema } from "./schema";
import { getEventStatus } from "./dates";
import { normalizeDateOnly } from "./dates";
import { findLikelyDuplicates } from "./duplicate";
import { seedExhibitions } from "./seed-data";
import { resolveTaxonomySelections } from "./taxonomy";
import { validateLocationSelection } from "@/lib/locations";
import type { Exhibition, ExhibitionFilters, ExhibitionInput, ExhibitionListResult } from "./types";

const globalStore = globalThis as unknown as { iecDemoExhibitions?: Exhibition[]; iecDatabaseRetryAt?: number };
if (!globalStore.iecDemoExhibitions) globalStore.iecDemoExhibitions = structuredClone(seedExhibitions);

const useDatabase = Boolean(process.env.DATABASE_URL);

function canUseDemoFallback(error: unknown) {
  if (process.env.NODE_ENV === "production" || process.env.EXHIBITION_DATA_MODE === "database") return false;
  const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
  const message = error instanceof Error ? error.message : String(error);
  return code === "P1001" || code === "P1000" || message.includes("Can't reach database server") || message.includes("Authentication failed");
}

function reportDemoFallback(error: unknown) {
  globalStore.iecDatabaseRetryAt = Date.now() + 10_000;
  const message = error instanceof Error ? error.message.split("\n").find((line) => line.trim()) : "Database unavailable";
  console.warn(`[IEC ExpoTrack] ${message}. Using the non-persistent demo catalog until PostgreSQL is available.`);
}

function slugify(name: string) {
  return name.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

const recordInclude = {
  sources: { orderBy: { priority: "asc" as const } },
  categories: { include: { category: true } },
  topicLinks: { include: { topic: true } },
  createdBy: { select: { id: true, username: true } },
  updatedBy: { select: { id: true, username: true } },
  preEventEmailSentBy: { select: { id: true, username: true } },
  postEventEmailSentBy: { select: { id: true, username: true } },
};

function mapRecord(record: Record<string, unknown>): Exhibition {
  const categoryLinks = Array.isArray(record.categories) ? record.categories as Array<{ category?: Record<string, unknown> }> : [];
  const topicLinks = Array.isArray(record.topicLinks) ? record.topicLinks as Array<{ topic?: Record<string, unknown> }> : [];
  const categories = categoryLinks.flatMap((link) => link.category ? [{ id: String(link.category.id), name: String(link.category.name), slug: String(link.category.slug) }] : []);
  const topicItems = topicLinks.flatMap((link) => link.topic ? [{ id: String(link.topic.id), name: String(link.topic.name), slug: String(link.topic.slug) }] : []);
  const legacyTopics = Array.isArray(record.topics) ? record.topics.map(String) : [];
  return {
    id: String(record.id), slug: String(record.slug), name: String(record.name), tagline: String(record.tagline ?? ""),
    industry: categories.length ? categories.map((item) => item.name).join(", ") : String(record.industry ?? "Energy"), eventType: String(record.eventType ?? "International Exhibition"),
    country: String(record.country), countryCode: String(record.countryCode ?? ""), city: String(record.city ?? ""), venue: String(record.venue ?? ""), address: String(record.address ?? ""),
    startDate: new Date(record.startDate as string | Date).toISOString(), endDate: record.endDate ? new Date(record.endDate as string | Date).toISOString() : null,
    timezone: String(record.timezone ?? "UTC"), organizer: String(record.organizer ?? ""), website: String(record.website ?? ""),
    description: String(record.description ?? ""), aiReport: String(record.aiReport ?? ""), topics: topicItems.length ? topicItems.map((item) => item.name) : legacyTopics,
    categories, topicItems,
    saved: Boolean(record.saved),
    preEventEmailSent: Boolean(record.preEventEmailSent), preEventEmailSentAt: record.preEventEmailSentAt ? new Date(record.preEventEmailSentAt as string | Date).toISOString() : null,
    postEventEmailSent: Boolean(record.postEventEmailSent), postEventEmailSentAt: record.postEventEmailSentAt ? new Date(record.postEventEmailSentAt as string | Date).toISOString() : null,
    preEventEmailSentBy: record.preEventEmailSentBy as { id: string; username: string } | null ?? null,
    postEventEmailSentBy: record.postEventEmailSentBy as { id: string; username: string } | null ?? null,
    createdBy: record.createdBy as { id: string; username: string } | null ?? null, updatedBy: record.updatedBy as { id: string; username: string } | null ?? null,
    createdAt: new Date(record.createdAt as string | Date).toISOString(), updatedAt: new Date(record.updatedAt as string | Date).toISOString(),
    sources: Array.isArray(record.sources) ? (record.sources as Record<string, unknown>[]).map((source) => ({
      id: String(source.id), label: String(source.label), url: String(source.url), priority: Number(source.priority), lastChecked: new Date(source.lastChecked as string | Date).toISOString(),
    })) : [],
  };
}

function matchStatus(item: Exhibition, status = "all") {
  return status === "all" || getEventStatus(item.startDate, item.endDate).state === status;
}

function filterDemo(items: Exhibition[], filters: ExhibitionFilters) {
  const q = filters.q?.trim().toLowerCase();
  return items.filter((item) => {
    const searchText = [item.name, item.industry, item.country, item.city, item.venue, item.organizer, ...item.topics].join(" ").toLowerCase();
    return (!q || searchText.includes(q)) && (!filters.country || item.country === filters.country) && (!filters.industry || item.industry === filters.industry)
      && (!filters.year || new Date(item.startDate).getFullYear().toString() === filters.year) && (!filters.topic || item.topics.some((topic) => topic.toLowerCase() === filters.topic!.toLowerCase()))
      && matchStatus(item, filters.status);
  });
}

function databaseWhere(filters: ExhibitionFilters, forcedStatus?: "upcoming" | "ongoing" | "past"): Prisma.ExhibitionWhereInput {
  const conditions: Prisma.ExhibitionWhereInput[] = [];
  const q = filters.q?.trim();
  if (q) conditions.push({ OR: [
    ...["name", "industry", "country", "city", "venue", "organizer"].map((field) => ({ [field]: { contains: q, mode: "insensitive" } })),
    { categories: { some: { category: { name: { contains: q, mode: "insensitive" } } } } },
    { topicLinks: { some: { topic: { name: { contains: q, mode: "insensitive" } } } } },
  ] as Prisma.ExhibitionWhereInput[] });
  if (filters.country) conditions.push({ country: filters.country });
  if (filters.industry) conditions.push({ OR: [{ industry: filters.industry }, { categories: { some: { category: { name: filters.industry } } } }] });
  if (filters.topic) conditions.push({ OR: [{ topics: { array_contains: [filters.topic] } }, { topicLinks: { some: { topic: { name: filters.topic } } } }] });
  if (filters.year) {
    const year = Number(filters.year);
    if (Number.isInteger(year)) conditions.push({ startDate: { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) } });
  }
  const status = forcedStatus ?? (filters.status && filters.status !== "all" ? filters.status : undefined);
  if (status) {
    const now = new Date(); const startOfToday = new Date(now); const endOfToday = new Date(now);
    startOfToday.setUTCHours(0, 0, 0, 0); endOfToday.setUTCHours(23, 59, 59, 999);
    if (status === "upcoming") conditions.push({ startDate: { gt: endOfToday } });
    if (status === "ongoing") conditions.push({ startDate: { lte: endOfToday }, OR: [{ endDate: { gte: startOfToday } }, { endDate: null, startDate: { gte: startOfToday, lte: endOfToday } }] });
    if (status === "past") conditions.push({ OR: [{ endDate: { lt: startOfToday } }, { endDate: null, startDate: { lt: startOfToday } }] });
  }
  return conditions.length ? { AND: conditions } : {};
}

function databaseOrder(sort = "nearest", status?: "upcoming" | "ongoing" | "past"): Prisma.ExhibitionOrderByWithRelationInput[] {
  if (sort === "latest") return [{ startDate: "desc" }];
  if (sort === "name") return [{ name: "asc" }];
  if (sort === "country") return [{ country: "asc" }, { name: "asc" }];
  if (sort === "recent") return [{ createdAt: "desc" }];
  return status === "past" ? [{ endDate: "desc" }, { startDate: "desc" }] : [{ startDate: "asc" }];
}

export function sortItems(items: Exhibition[], sort = "nearest", now: string | Date = new Date()) {
  return [...items].sort((a, b) => {
    if (sort === "latest") return +new Date(b.startDate) - +new Date(a.startDate);
    if (sort === "name") return a.name.localeCompare(b.name);
    if (sort === "country") return a.country.localeCompare(b.country) || a.name.localeCompare(b.name);
    if (sort === "recent") return +new Date(b.createdAt) - +new Date(a.createdAt);
    const stateA = getEventStatus(a.startDate, a.endDate, now, a.timezone).state;
    const stateB = getEventStatus(b.startDate, b.endDate, now, b.timezone).state;
    const rank = { ongoing: 0, upcoming: 1, past: 2 };
    if (rank[stateA] !== rank[stateB]) return rank[stateA] - rank[stateB];
    if (stateA === "past") return +new Date(b.endDate ?? b.startDate) - +new Date(a.endDate ?? a.startDate);
    return +new Date(a.startDate) - +new Date(b.startDate);
  });
}

export async function listExhibitions(filters: ExhibitionFilters = {}): Promise<ExhibitionListResult> {
  const pageSize = Math.min(50, Math.max(1, filters.pageSize ?? 10));
  const page = Math.max(1, filters.page ?? 1);
  if (useDatabase && Date.now() >= (globalStore.iecDatabaseRetryAt ?? 0)) {
    try {
      const offset = (page - 1) * pageSize;
      const include = recordInclude;
      let records: unknown[] = []; let total = 0;
      if ((filters.sort ?? "nearest") === "nearest" && (filters.status ?? "all") === "all") {
        const groups = ["ongoing", "upcoming", "past"] as const;
        const counts = await Promise.all(groups.map((status) => prisma.exhibition.count({ where: databaseWhere(filters, status) })));
        total = counts.reduce((sum, count) => sum + count, 0);
        let remainingOffset = offset; let remainingTake = pageSize;
        for (let index = 0; index < groups.length && remainingTake > 0; index++) {
          if (remainingOffset >= counts[index]) { remainingOffset -= counts[index]; continue; }
          const chunk = await prisma.exhibition.findMany({ where: databaseWhere(filters, groups[index]), orderBy: databaseOrder("nearest", groups[index]), skip: remainingOffset, take: remainingTake, include });
          records.push(...chunk); remainingTake -= chunk.length; remainingOffset = 0;
        }
      } else {
        const where = databaseWhere(filters); total = await prisma.exhibition.count({ where });
        const status = filters.status && filters.status !== "all" ? filters.status : undefined;
        records = await prisma.exhibition.findMany({ where, orderBy: databaseOrder(filters.sort, status), skip: offset, take: pageSize, include });
      }
      const optionRows = await prisma.exhibition.findMany({ select: { country: true, industry: true, startDate: true, categories: { select: { category: { select: { name: true } } } } } });
      const industryOptions = [...new Set(optionRows.flatMap((item) => item.categories.length ? item.categories.map((link) => link.category.name) : [item.industry]).filter(Boolean))].sort();
      return {
        items: records.map((record) => mapRecord(record as Record<string, unknown>)), total, page, pageSize, pageCount: Math.max(1, Math.ceil(total / pageSize)),
        stats: { total: optionRows.length, countries: new Set(optionRows.map((item) => item.country).filter(Boolean)).size, industries: industryOptions.length },
        options: { countries: [...new Set(optionRows.map((item) => item.country).filter(Boolean))].sort(), industries: industryOptions, years: [...new Set(optionRows.map((item) => String(item.startDate.getUTCFullYear())))].sort() },
      };
    } catch (error) {
      if (!canUseDemoFallback(error)) throw error;
      reportDemoFallback(error);
    }
  }
  const all = globalStore.iecDemoExhibitions!;

  const filtered = sortItems(filterDemo(all, filters), filters.sort);
  const total = filtered.length;
  return {
    items: filtered.slice((page - 1) * pageSize, page * pageSize), total, page, pageSize, pageCount: Math.max(1, Math.ceil(total / pageSize)),
    stats: { total: all.length, countries: new Set(all.map((item) => item.country).filter(Boolean)).size, industries: new Set(all.map((item) => item.industry).filter(Boolean)).size },
    options: {
      countries: [...new Set(all.map((item) => item.country).filter(Boolean))].sort(),
      industries: [...new Set(all.map((item) => item.industry).filter(Boolean))].sort(),
      years: [...new Set(all.map((item) => String(new Date(item.startDate).getFullYear())))].sort(),
    },
  };
}

export async function getExhibition(identifier: string) {
  if (useDatabase && Date.now() >= (globalStore.iecDatabaseRetryAt ?? 0)) {
    try {
      const record = await prisma.exhibition.findFirst({ where: { OR: [{ id: identifier }, { slug: identifier }] }, include: recordInclude });
      return record ? mapRecord(record as unknown as Record<string, unknown>) : null;
    } catch (error) {
      if (!canUseDemoFallback(error)) throw error;
      reportDemoFallback(error);
    }
  }
  return globalStore.iecDemoExhibitions!.find((item) => item.id === identifier || item.slug === identifier) ?? null;
}

async function validatedInput(raw: ExhibitionInput) {
  const input = exhibitionSchema.parse({ ...raw, startDate: normalizeDateOnly(raw.startDate), endDate: raw.endDate ? normalizeDateOnly(raw.endDate) : null });
  const [country, selections] = await Promise.all([
    validateLocationSelection(input),
    resolveTaxonomySelections(input.categoryIds, input.topicIds),
  ]);
  return {
    ...input,
    country: country.name,
    categoryIds: [...new Set(input.categoryIds)],
    topicIds: [...new Set(input.topicIds)],
    industry: selections.categories.map((item) => item.name).join(", "),
    topics: selections.topics.map((item) => item.name),
    categories: selections.categories,
    topicItems: selections.topics,
  };
}

type PreparedInput = Awaited<ReturnType<typeof validatedInput>>;

function scalarFields(input: PreparedInput) {
  return {
    name: input.name, tagline: input.tagline, industry: input.industry, eventType: input.eventType,
    country: input.country, countryCode: input.countryCode, city: input.city, venue: input.venue, address: input.address,
    startDate: input.startDate, endDate: input.endDate, timezone: input.timezone, organizer: input.organizer,
    website: input.website, description: input.description, aiReport: input.aiReport, topics: input.topics,
  };
}

export class DuplicateExhibitionError extends Error {
  code = "POSSIBLE_DUPLICATE" as const;
  constructor(public duplicates: ReturnType<typeof findLikelyDuplicates>) { super("A possible duplicate exhibition was found."); }
}

export async function findDuplicateExhibitions(raw: ExhibitionInput, excludeId?: string) {
  const input = await validatedInput(raw);
  let candidates: Exhibition[];
  if (useDatabase && Date.now() >= (globalStore.iecDatabaseRetryAt ?? 0)) {
    try {
      const start = new Date(input.startDate); const from = new Date(start); const to = new Date(start);
      from.setUTCFullYear(start.getUTCFullYear() - 1); to.setUTCFullYear(start.getUTCFullYear() + 1);
      const records = await prisma.exhibition.findMany({ where: { id: excludeId ? { not: excludeId } : undefined, OR: [{ country: { equals: input.country, mode: "insensitive" } }, { startDate: { gte: from, lte: to } }] }, include: recordInclude, take: 50 });
      candidates = records.map((record: unknown) => mapRecord(record as Record<string, unknown>));
    } catch (error) {
      if (!canUseDemoFallback(error)) throw error;
      reportDemoFallback(error); candidates = globalStore.iecDemoExhibitions!.filter((item) => item.id !== excludeId);
    }
  } else candidates = globalStore.iecDemoExhibitions!.filter((item) => item.id !== excludeId);
  return findLikelyDuplicates(candidates, input);
}

export async function createExhibition(raw: ExhibitionInput, options: { allowDuplicate?: boolean; actorId?: string } = {}) {
  const input = await validatedInput(raw);
  if (!options.allowDuplicate) {
    const duplicates = await findDuplicateExhibitions(input);
    if (duplicates.length) throw new DuplicateExhibitionError(duplicates);
  }
  let slug = slugify(input.name);
  if (await getExhibition(slug)) slug = `${slug}-${slugify(input.city || input.country)}`;
  if (await getExhibition(slug)) slug = `${slug}-${Date.now().toString(36)}`;
  if (useDatabase && Date.now() >= (globalStore.iecDatabaseRetryAt ?? 0)) {
    try {
      const record = await prisma.$transaction(async (tx) => {
        const created = await tx.exhibition.create({ data: {
          ...scalarFields(input), slug, startDate: new Date(input.startDate), endDate: input.endDate ? new Date(input.endDate) : null,
          createdById: options.actorId, updatedById: options.actorId,
          sources: { create: input.sources.map((source) => ({ ...source, lastChecked: new Date(source.lastChecked) })) },
          categories: { create: input.categoryIds.map((categoryId) => ({ categoryId })) },
          topicLinks: { create: input.topicIds.map((topicId) => ({ topicId })) },
        }, include: recordInclude });
        if (options.actorId) await tx.auditLog.create({ data: { actorUserId: options.actorId, action: "CREATE_EXHIBITION", entityType: "EXHIBITION", entityId: created.id, entityLabel: created.name, description: `Created exhibition ${created.name}` } });
        return created;
      });
      return mapRecord(record as unknown as Record<string, unknown>);
    } catch (error) {
      if (!canUseDemoFallback(error)) throw error;
      reportDemoFallback(error);
    }
  }
  const now = new Date().toISOString();
  const item: Exhibition = { ...scalarFields(input), categories: input.categories, topicItems: input.topicItems, id: crypto.randomUUID(), slug, saved: false, createdAt: now, updatedAt: now, sources: input.sources.map((source) => ({ ...source, id: crypto.randomUUID() })) };
  globalStore.iecDemoExhibitions!.unshift(item);
  return item;
}

export async function updateExhibition(id: string, raw: ExhibitionInput, options: { skipDuplicateCheck?: boolean; actorId?: string } = {}) {
  const input = await validatedInput(raw);
  if (!options.skipDuplicateCheck) {
    const duplicates = await findDuplicateExhibitions(input, id);
    if (duplicates.length) throw new DuplicateExhibitionError(duplicates);
  }
  if (useDatabase && Date.now() >= (globalStore.iecDatabaseRetryAt ?? 0)) {
    try {
      const record = await prisma.$transaction(async (tx) => {
        const before = await tx.exhibition.findUniqueOrThrow({ where: { id } });
        const next = scalarFields(input);
        const labels: Record<string, string> = { name: "Name", tagline: "Tagline", industry: "Categories", eventType: "Event Type", country: "Country", countryCode: "Country Code", city: "City", venue: "Venue", address: "Address", startDate: "Start Date", endDate: "End Date", timezone: "Timezone", organizer: "Organizer", website: "Website", description: "Description", aiReport: "AI Report", topics: "Topics" };
        const changed = Object.keys(labels).filter((key) => JSON.stringify((before as unknown as Record<string, unknown>)[key]) !== JSON.stringify((next as unknown as Record<string, unknown>)[key])).map((key) => labels[key]);
        const updated = await tx.exhibition.update({ where: { id }, data: {
          ...next, startDate: new Date(input.startDate), endDate: input.endDate ? new Date(input.endDate) : null, updatedById: options.actorId,
          sources: { deleteMany: {}, create: input.sources.map((source) => ({ ...source, lastChecked: new Date(source.lastChecked) })) },
          categories: { deleteMany: {}, create: input.categoryIds.map((categoryId) => ({ categoryId })) },
          topicLinks: { deleteMany: {}, create: input.topicIds.map((topicId) => ({ topicId })) },
        }, include: recordInclude });
        if (options.actorId) await tx.auditLog.create({ data: { actorUserId: options.actorId, action: "UPDATE_EXHIBITION", entityType: "EXHIBITION", entityId: updated.id, entityLabel: updated.name, description: changed.length ? `Updated ${changed.join(", ")}` : `Updated exhibition ${updated.name}`, metadata: { changedFields: changed } } });
        return updated;
      });
      return mapRecord(record as unknown as Record<string, unknown>);
    } catch (error) {
      if (!canUseDemoFallback(error)) throw error;
      reportDemoFallback(error);
    }
  }
  const index = globalStore.iecDemoExhibitions!.findIndex((item) => item.id === id);
  if (index < 0) throw new Error("Exhibition not found");
  const existing = globalStore.iecDemoExhibitions![index];
  const updated: Exhibition = { ...existing, ...scalarFields(input), categories: input.categories, topicItems: input.topicItems, updatedAt: new Date().toISOString(), sources: input.sources.map((source, i) => ({ ...source, id: existing.sources[i]?.id ?? crypto.randomUUID() })) };
  globalStore.iecDemoExhibitions![index] = updated;
  return updated;
}

export async function deleteExhibition(id: string, actorId?: string) {
  if (useDatabase && Date.now() >= (globalStore.iecDatabaseRetryAt ?? 0)) {
    try { await prisma.$transaction(async (tx) => { const item = await tx.exhibition.findUniqueOrThrow({ where: { id }, select: { id: true, name: true } }); await tx.exhibition.delete({ where: { id } }); if (actorId) await tx.auditLog.create({ data: { actorUserId: actorId, action: "DELETE_EXHIBITION", entityType: "EXHIBITION", entityId: item.id, entityLabel: item.name, description: `Deleted exhibition ${item.name}` } }); }); return; }
    catch (error) { if (!canUseDemoFallback(error)) throw error; reportDemoFallback(error); }
  }
  globalStore.iecDemoExhibitions = globalStore.iecDemoExhibitions!.filter((item) => item.id !== id);
}

export async function setEmailFollowUpStatus(id: string, kind: "pre" | "post", sent: boolean, actorId: string) {
  const now = new Date();
  const isPre = kind === "pre";
  return prisma.$transaction(async (tx) => {
    const existing = await tx.exhibition.findUniqueOrThrow({ where: { id }, select: { id: true, name: true } });
    const updated = await tx.exhibition.update({ where: { id }, data: isPre ? {
      preEventEmailSent: sent, preEventEmailSentAt: sent ? now : null, preEventEmailSentById: sent ? actorId : null, updatedById: actorId,
    } : {
      postEventEmailSent: sent, postEventEmailSentAt: sent ? now : null, postEventEmailSentById: sent ? actorId : null, updatedById: actorId,
    }, include: recordInclude });
    await tx.auditLog.create({ data: {
      actorUserId: actorId,
      action: isPre ? (sent ? "PRE_EVENT_EMAIL_MARKED_SENT" : "PRE_EVENT_EMAIL_MARKED_UNSENT") : (sent ? "POST_EVENT_EMAIL_MARKED_SENT" : "POST_EVENT_EMAIL_MARKED_UNSENT"),
      entityType: "EXHIBITION", entityId: existing.id, entityLabel: existing.name,
      description: `Marked ${isPre ? "pre-event" : "post-event"} email as ${sent ? "sent" : "not sent"}`,
      metadata: { sent },
    } });
    return mapRecord(updated as unknown as Record<string, unknown>);
  });
}

export async function toggleSaved(id: string) {
  if (useDatabase && Date.now() >= (globalStore.iecDatabaseRetryAt ?? 0)) {
    try {
      const current = await prisma.exhibition.findUniqueOrThrow({ where: { id } });
      return prisma.exhibition.update({ where: { id }, data: { saved: !current.saved } }).then((record: { saved: boolean }) => Boolean(record.saved));
    } catch (error) {
      if (!canUseDemoFallback(error)) throw error;
      reportDemoFallback(error);
    }
  }
  const item = globalStore.iecDemoExhibitions!.find((entry) => entry.id === id);
  if (!item) throw new Error("Exhibition not found");
  item.saved = !item.saved;
  return item.saved;
}
