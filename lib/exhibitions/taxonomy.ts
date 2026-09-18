import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { seedExhibitions } from "./seed-data";
import type { Exhibition, TaxonomyItem } from "./types";

export type TaxonomyKind = "categories" | "topics";

type DemoTaxonomies = Record<TaxonomyKind, TaxonomyItem[]>;
const globalStore = globalThis as unknown as { iecDemoTaxonomies?: DemoTaxonomies; iecDemoExhibitions?: Exhibition[]; iecTaxonomyDatabaseRetryAt?: number };

function unique(items: TaxonomyItem[]) {
  return [...new Map(items.map((item) => [item.id, item])).values()];
}

if (!globalStore.iecDemoTaxonomies) {
  globalStore.iecDemoTaxonomies = {
    categories: unique(seedExhibitions.flatMap((item) => item.categories)),
    topics: unique(seedExhibitions.flatMap((item) => item.topicItems)),
  };
}

const useDatabase = Boolean(process.env.DATABASE_URL);

function canUseDemoFallback(error: unknown) {
  if (process.env.NODE_ENV === "production" || process.env.EXHIBITION_DATA_MODE === "database") return false;
  const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
  const message = error instanceof Error ? error.message : String(error);
  return code === "P1001" || code === "P1000" || message.includes("Can't reach database server") || message.includes("Authentication failed");
}

export function normalizeTaxonomyName(name: string) {
  return name.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}

function displayName(name: string) {
  return name.normalize("NFKC").trim().replace(/\s+/g, " ");
}

function slugify(name: string) {
  const base = normalizeTaxonomyName(name).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "item";
  return `${base}-${randomUUID().slice(0, 8)}`;
}

export class DuplicateTaxonomyError extends Error {
  code = "DUPLICATE_TAXONOMY" as const;
  constructor() { super("An item with this name already exists."); }
}

export class TaxonomyInUseError extends Error {
  code = "TAXONOMY_IN_USE" as const;
  constructor(public usageCount: number) { super(`This item is used by ${usageCount} exhibition${usageCount === 1 ? "" : "s"} and cannot be deleted.`); }
}

function mapDatabaseItem(item: { id: string; name: string; slug: string; _count?: { exhibitions: number } }): TaxonomyItem {
  return { id: item.id, name: item.name, slug: item.slug, usageCount: item._count?.exhibitions ?? 0 };
}

function demoUsage(kind: TaxonomyKind, id: string) {
  return (globalStore.iecDemoExhibitions ?? seedExhibitions).filter((item) => kind === "categories" ? item.categories.some((entry) => entry.id === id) : item.topicItems.some((entry) => entry.id === id)).length;
}

export async function listTaxonomies(kind: TaxonomyKind): Promise<TaxonomyItem[]> {
  if (useDatabase && Date.now() >= (globalStore.iecTaxonomyDatabaseRetryAt ?? 0)) {
    try {
      const records = kind === "categories"
        ? await prisma.industryCategory.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { exhibitions: true } } } })
        : await prisma.topic.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { exhibitions: true } } } });
      return records.map(mapDatabaseItem);
    } catch (error) {
      if (!canUseDemoFallback(error)) throw error;
      globalStore.iecTaxonomyDatabaseRetryAt = Date.now() + 10_000;
    }
  }
  return globalStore.iecDemoTaxonomies![kind]
    .map((item) => ({ ...item, usageCount: demoUsage(kind, item.id) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function createTaxonomy(kind: TaxonomyKind, rawName: string) {
  const name = displayName(rawName);
  const normalizedName = normalizeTaxonomyName(name);
  if (!normalizedName) throw new Error("Name is required.");
  if (useDatabase && Date.now() >= (globalStore.iecTaxonomyDatabaseRetryAt ?? 0)) {
    try {
      const data = { name, normalizedName, slug: slugify(name) };
      const record = kind === "categories" ? await prisma.industryCategory.create({ data }) : await prisma.topic.create({ data });
      return mapDatabaseItem(record);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new DuplicateTaxonomyError();
      if (!canUseDemoFallback(error)) throw error;
      globalStore.iecTaxonomyDatabaseRetryAt = Date.now() + 10_000;
    }
  }
  const items = globalStore.iecDemoTaxonomies![kind];
  if (items.some((item) => normalizeTaxonomyName(item.name) === normalizedName)) throw new DuplicateTaxonomyError();
  const item = { id: `demo-${kind === "categories" ? "category" : "topic"}-${randomUUID()}`, name, slug: slugify(name), usageCount: 0 };
  items.push(item);
  return item;
}

export async function renameTaxonomy(kind: TaxonomyKind, id: string, rawName: string) {
  const name = displayName(rawName);
  const normalizedName = normalizeTaxonomyName(name);
  if (!normalizedName) throw new Error("Name is required.");
  if (useDatabase && Date.now() >= (globalStore.iecTaxonomyDatabaseRetryAt ?? 0)) {
    try {
      const record = kind === "categories"
        ? await prisma.industryCategory.update({ where: { id }, data: { name, normalizedName } })
        : await prisma.topic.update({ where: { id }, data: { name, normalizedName } });
      return mapDatabaseItem(record);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new DuplicateTaxonomyError();
      if (!canUseDemoFallback(error)) throw error;
      globalStore.iecTaxonomyDatabaseRetryAt = Date.now() + 10_000;
    }
  }
  const items = globalStore.iecDemoTaxonomies![kind];
  if (items.some((item) => item.id !== id && normalizeTaxonomyName(item.name) === normalizedName)) throw new DuplicateTaxonomyError();
  const item = items.find((entry) => entry.id === id);
  if (!item) throw new Error("Item not found.");
  item.name = name;
  for (const exhibition of globalStore.iecDemoExhibitions ?? []) {
    if (kind === "categories") {
      exhibition.categories = exhibition.categories.map((entry) => entry.id === id ? { ...entry, name } : entry);
      exhibition.industry = exhibition.categories.map((entry) => entry.name).join(", ");
    } else {
      exhibition.topicItems = exhibition.topicItems.map((entry) => entry.id === id ? { ...entry, name } : entry);
      exhibition.topics = exhibition.topicItems.map((entry) => entry.name);
    }
  }
  return { ...item, usageCount: demoUsage(kind, id) };
}

export async function deleteTaxonomy(kind: TaxonomyKind, id: string) {
  if (useDatabase && Date.now() >= (globalStore.iecTaxonomyDatabaseRetryAt ?? 0)) {
    try {
      const usageCount = kind === "categories" ? await prisma.exhibitionCategory.count({ where: { categoryId: id } }) : await prisma.exhibitionTopic.count({ where: { topicId: id } });
      if (usageCount) throw new TaxonomyInUseError(usageCount);
      if (kind === "categories") await prisma.industryCategory.delete({ where: { id } });
      else await prisma.topic.delete({ where: { id } });
      return;
    } catch (error) {
      if (error instanceof TaxonomyInUseError || !canUseDemoFallback(error)) throw error;
      globalStore.iecTaxonomyDatabaseRetryAt = Date.now() + 10_000;
    }
  }
  const usageCount = demoUsage(kind, id);
  if (usageCount) throw new TaxonomyInUseError(usageCount);
  const index = globalStore.iecDemoTaxonomies![kind].findIndex((item) => item.id === id);
  if (index < 0) throw new Error("Item not found.");
  globalStore.iecDemoTaxonomies![kind].splice(index, 1);
}

export async function resolveTaxonomySelections(categoryIds: string[], topicIds: string[]) {
  const uniqueCategoryIds = [...new Set(categoryIds)];
  const uniqueTopicIds = [...new Set(topicIds)];
  if (useDatabase && Date.now() >= (globalStore.iecTaxonomyDatabaseRetryAt ?? 0)) {
    try {
      const [categories, topics] = await Promise.all([
        prisma.industryCategory.findMany({ where: { id: { in: uniqueCategoryIds } } }),
        prisma.topic.findMany({ where: { id: { in: uniqueTopicIds } } }),
      ]);
      if (categories.length !== uniqueCategoryIds.length) throw new Error("One or more selected categories no longer exist.");
      if (topics.length !== uniqueTopicIds.length) throw new Error("One or more selected topics no longer exist.");
      return { categories: categories.map(mapDatabaseItem), topics: topics.map(mapDatabaseItem) };
    } catch (error) {
      if (!canUseDemoFallback(error)) throw error;
      globalStore.iecTaxonomyDatabaseRetryAt = Date.now() + 10_000;
    }
  }
  const categories = globalStore.iecDemoTaxonomies!.categories.filter((item) => uniqueCategoryIds.includes(item.id));
  const topics = globalStore.iecDemoTaxonomies!.topics.filter((item) => uniqueTopicIds.includes(item.id));
  if (categories.length !== uniqueCategoryIds.length) throw new Error("One or more selected categories no longer exist.");
  if (topics.length !== uniqueTopicIds.length) throw new Error("One or more selected topics no longer exist.");
  return { categories, topics };
}
