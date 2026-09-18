import { prisma } from "@/lib/prisma";
import { exhibitionSchema } from "./schema";
import { getEventStatus } from "./dates";
import { seedExhibitions } from "./seed-data";
import type { Exhibition, ExhibitionFilters, ExhibitionInput, ExhibitionListResult } from "./types";

const globalStore = globalThis as unknown as { iecDemoExhibitions?: Exhibition[] };
if (!globalStore.iecDemoExhibitions) globalStore.iecDemoExhibitions = structuredClone(seedExhibitions);

const useDatabase = Boolean(process.env.DATABASE_URL);

function canUseDemoFallback(error: unknown) {
  if (process.env.NODE_ENV === "production" || process.env.EXHIBITION_DATA_MODE === "database") return false;
  const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
  const message = error instanceof Error ? error.message : String(error);
  return code === "P1001" || code === "P1000" || message.includes("Can't reach database server") || message.includes("Authentication failed");
}

function reportDemoFallback(error: unknown) {
  const message = error instanceof Error ? error.message.split("\n").find((line) => line.trim()) : "Database unavailable";
  console.warn(`[IEC ExpoTrack] ${message}. Using the non-persistent demo catalog until PostgreSQL is available.`);
}

function slugify(name: string) {
  return name.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function mapRecord(record: Record<string, unknown>): Exhibition {
  return {
    id: String(record.id), slug: String(record.slug), name: String(record.name), tagline: String(record.tagline ?? ""),
    industry: String(record.industry ?? "Energy"), eventType: String(record.eventType ?? "International Exhibition"),
    country: String(record.country), city: String(record.city ?? ""), venue: String(record.venue ?? ""), address: String(record.address ?? ""),
    startDate: new Date(record.startDate as string | Date).toISOString(), endDate: record.endDate ? new Date(record.endDate as string | Date).toISOString() : null,
    timezone: String(record.timezone ?? "UTC"), organizer: String(record.organizer ?? ""), website: String(record.website ?? ""),
    description: String(record.description ?? ""), aiReport: String(record.aiReport ?? ""), topics: Array.isArray(record.topics) ? record.topics.map(String) : [],
    saved: Boolean(record.saved), createdAt: new Date(record.createdAt as string | Date).toISOString(), updatedAt: new Date(record.updatedAt as string | Date).toISOString(),
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

function sortItems(items: Exhibition[], sort = "nearest") {
  return [...items].sort((a, b) => {
    if (sort === "latest") return +new Date(b.startDate) - +new Date(a.startDate);
    if (sort === "name") return a.name.localeCompare(b.name);
    if (sort === "country") return a.country.localeCompare(b.country) || a.name.localeCompare(b.name);
    if (sort === "recent") return +new Date(b.createdAt) - +new Date(a.createdAt);
    return +new Date(a.startDate) - +new Date(b.startDate);
  });
}

export async function listExhibitions(filters: ExhibitionFilters = {}): Promise<ExhibitionListResult> {
  const pageSize = Math.min(50, Math.max(1, filters.pageSize ?? 10));
  const page = Math.max(1, filters.page ?? 1);
  let all: Exhibition[];
  if (useDatabase) {
    try {
      const records = await prisma.exhibition.findMany({ include: { sources: { orderBy: { priority: "asc" } } } });
      all = records.map((record: unknown) => mapRecord(record as Record<string, unknown>));
    } catch (error) {
      if (!canUseDemoFallback(error)) throw error;
      reportDemoFallback(error);
      all = globalStore.iecDemoExhibitions!;
    }
  } else all = globalStore.iecDemoExhibitions!;

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
  if (useDatabase) {
    try {
      const record = await prisma.exhibition.findFirst({ where: { OR: [{ id: identifier }, { slug: identifier }] }, include: { sources: { orderBy: { priority: "asc" } } } });
      return record ? mapRecord(record as unknown as Record<string, unknown>) : null;
    } catch (error) {
      if (!canUseDemoFallback(error)) throw error;
      reportDemoFallback(error);
    }
  }
  return globalStore.iecDemoExhibitions!.find((item) => item.id === identifier || item.slug === identifier) ?? null;
}

export async function createExhibition(raw: ExhibitionInput) {
  const input = exhibitionSchema.parse(raw);
  const duplicate = (await listExhibitions({ pageSize: 50 })).items.find((item) => item.name.toLowerCase() === input.name.toLowerCase() && item.startDate.slice(0, 10) === input.startDate.slice(0, 10));
  if (duplicate) throw new Error("An exhibition with the same name and start date already exists.");
  let slug = slugify(input.name);
  if (await getExhibition(slug)) slug = `${slug}-${slugify(input.city || input.country)}`;
  if (useDatabase) {
    const record = await prisma.exhibition.create({ data: { ...input, slug, startDate: new Date(input.startDate), endDate: input.endDate ? new Date(input.endDate) : null, topics: input.topics, sources: { create: input.sources.map((source) => ({ ...source, lastChecked: new Date(source.lastChecked) })) } }, include: { sources: true } });
    return mapRecord(record as unknown as Record<string, unknown>);
  }
  const now = new Date().toISOString();
  const item: Exhibition = { ...input, id: crypto.randomUUID(), slug, saved: false, createdAt: now, updatedAt: now, sources: input.sources.map((source) => ({ ...source, id: crypto.randomUUID() })) };
  globalStore.iecDemoExhibitions!.unshift(item);
  return item;
}

export async function updateExhibition(id: string, raw: ExhibitionInput) {
  const input = exhibitionSchema.parse(raw);
  if (useDatabase) {
    const record = await prisma.exhibition.update({ where: { id }, data: { ...input, startDate: new Date(input.startDate), endDate: input.endDate ? new Date(input.endDate) : null, sources: { deleteMany: {}, create: input.sources.map((source) => ({ ...source, lastChecked: new Date(source.lastChecked) })) } }, include: { sources: true } });
    return mapRecord(record as unknown as Record<string, unknown>);
  }
  const index = globalStore.iecDemoExhibitions!.findIndex((item) => item.id === id);
  if (index < 0) throw new Error("Exhibition not found");
  const existing = globalStore.iecDemoExhibitions![index];
  const updated: Exhibition = { ...existing, ...input, updatedAt: new Date().toISOString(), sources: input.sources.map((source, i) => ({ ...source, id: existing.sources[i]?.id ?? crypto.randomUUID() })) };
  globalStore.iecDemoExhibitions![index] = updated;
  return updated;
}

export async function deleteExhibition(id: string) {
  if (useDatabase) await prisma.exhibition.delete({ where: { id } });
  else globalStore.iecDemoExhibitions = globalStore.iecDemoExhibitions!.filter((item) => item.id !== id);
}

export async function toggleSaved(id: string) {
  if (useDatabase) {
    const current = await prisma.exhibition.findUniqueOrThrow({ where: { id } });
    return prisma.exhibition.update({ where: { id }, data: { saved: !current.saved } }).then((record: { saved: boolean }) => Boolean(record.saved));
  }
  const item = globalStore.iecDemoExhibitions!.find((entry) => entry.id === id);
  if (!item) throw new Error("Exhibition not found");
  item.saved = !item.saved;
  return item.saved;
}
