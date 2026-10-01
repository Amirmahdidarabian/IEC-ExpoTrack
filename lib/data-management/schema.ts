import { z } from "zod";
import { HttpError } from "@/lib/auth/errors";

export const BACKUP_FORMAT = "iec-expotrack" as const;
export const BACKUP_VERSION = 1 as const;
export const MAX_IMPORT_BYTES = 10 * 1024 * 1024;

const id = z.string().trim().min(1).max(191).regex(/^[A-Za-z0-9_-]+$/, "Invalid stable identifier");
const shortText = z.string().max(500);
const longText = z.string().max(100_000);
const isoDate = z.string().datetime({ offset: true });
const nullableDate = isoDate.nullable();
const httpUrl = z.string().max(2_048).refine((value) => {
  if (!value) return true;
  try { return ["http:", "https:"].includes(new URL(value).protocol); } catch { return false; }
}, "Only http(s) URLs are allowed");

const taxonomySchema = z.object({
  id,
  name: z.string().trim().min(1).max(120),
  normalizedName: z.string().trim().min(1).max(120),
  slug: z.string().trim().min(1).max(160),
  createdAt: isoDate,
  updatedAt: isoDate,
}).strict();

const sourceSchema = z.object({
  id,
  label: z.string().trim().min(1).max(200),
  url: httpUrl.refine(Boolean, "Source URL is required"),
  lastChecked: isoDate,
  priority: z.number().int().min(1).max(5),
}).strict();

const exhibitionSchema = z.object({
  id,
  slug: z.string().trim().min(1).max(191),
  name: z.string().trim().min(2).max(300),
  tagline: shortText,
  industry: shortText,
  eventType: z.string().max(200),
  country: z.string().trim().min(2).max(120),
  countryCode: z.string().regex(/^[A-Z]{2}$/).nullable(),
  city: z.string().max(160),
  venue: z.string().max(500),
  address: z.string().max(1_000),
  startDate: isoDate,
  endDate: nullableDate,
  timezone: z.string().min(1).max(100).refine((value) => {
    try { new Intl.DateTimeFormat("en", { timeZone: value }).format(); return true; } catch { return false; }
  }, "Invalid IANA timezone"),
  organizer: z.string().max(500),
  website: httpUrl,
  description: longText,
  aiReport: longText,
  topics: z.array(z.string().max(200)).max(500),
  saved: z.boolean(),
  exhibitorList: z.boolean().default(false),
  exhibitorListUrl: httpUrl.default(""),
  preEventEmailSent: z.boolean(),
  preEventEmailSentAt: nullableDate,
  postEventEmailSent: z.boolean(),
  postEventEmailSentAt: nullableDate,
  createdAt: isoDate,
  updatedAt: isoDate,
  categoryIds: z.array(id).max(100),
  topicIds: z.array(id).max(500),
  sources: z.array(sourceSchema).max(100),
}).strict().superRefine((value, context) => {
  if (value.endDate && new Date(value.endDate) < new Date(value.startDate)) context.addIssue({ code: "custom", path: ["endDate"], message: "End date precedes start date" });
  if (value.preEventEmailSent && !value.preEventEmailSentAt) context.addIssue({ code: "custom", path: ["preEventEmailSentAt"], message: "Sent pre-event email requires a timestamp" });
  if (value.postEventEmailSent && !value.postEventEmailSentAt) context.addIssue({ code: "custom", path: ["postEventEmailSentAt"], message: "Sent post-event email requires a timestamp" });
});

export const backupSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  version: z.literal(BACKUP_VERSION),
  exportedAt: isoDate,
  data: z.object({
    categories: z.array(taxonomySchema).max(2_000),
    topics: z.array(taxonomySchema).max(10_000),
    exhibitions: z.array(exhibitionSchema).max(25_000),
  }).strict(),
}).strict().superRefine((backup, context) => {
  const categoryIds = new Set(backup.data.categories.map((item) => item.id));
  const topicIds = new Set(backup.data.topics.map((item) => item.id));
  checkUnique(backup.data.categories, "id", ["data", "categories"], context);
  checkUnique(backup.data.categories, "normalizedName", ["data", "categories"], context);
  checkUnique(backup.data.categories, "slug", ["data", "categories"], context);
  checkUnique(backup.data.topics, "id", ["data", "topics"], context);
  checkUnique(backup.data.topics, "normalizedName", ["data", "topics"], context);
  checkUnique(backup.data.topics, "slug", ["data", "topics"], context);
  checkUnique(backup.data.exhibitions, "id", ["data", "exhibitions"], context);
  checkUnique(backup.data.exhibitions, "slug", ["data", "exhibitions"], context);
  backup.data.exhibitions.forEach((item, index) => {
    if (new Set(item.categoryIds).size !== item.categoryIds.length) context.addIssue({ code: "custom", path: ["data", "exhibitions", index, "categoryIds"], message: "Duplicate category reference" });
    if (new Set(item.topicIds).size !== item.topicIds.length) context.addIssue({ code: "custom", path: ["data", "exhibitions", index, "topicIds"], message: "Duplicate topic reference" });
    item.categoryIds.forEach((value) => { if (!categoryIds.has(value)) context.addIssue({ code: "custom", path: ["data", "exhibitions", index, "categoryIds"], message: `Unknown category reference: ${value}` }); });
    item.topicIds.forEach((value) => { if (!topicIds.has(value)) context.addIssue({ code: "custom", path: ["data", "exhibitions", index, "topicIds"], message: `Unknown topic reference: ${value}` }); });
  });
});

function checkUnique<T extends Record<string, unknown>>(items: T[], field: keyof T, path: PropertyKey[], context: z.RefinementCtx) {
  const seen = new Set<unknown>();
  items.forEach((item, index) => {
    const value = item[field];
    if (seen.has(value)) context.addIssue({ code: "custom", path: [...path, index, String(field)], message: `Duplicate ${String(field)}` });
    seen.add(value);
  });
}

export type BackupDocument = z.infer<typeof backupSchema>;

function assertSafeJsonStructure(root: unknown) {
  const stack: Array<{ value: unknown; depth: number }> = [{ value: root, depth: 0 }];
  let properties = 0;
  while (stack.length) {
    const { value, depth } = stack.pop()!;
    if (depth > 32) throw new HttpError("Backup JSON is nested too deeply.", 400);
    if (!value || typeof value !== "object") continue;
    for (const key of Object.keys(value)) {
      properties++;
      if (properties > 500_000) throw new HttpError("Backup JSON is too complex.", 400);
      if (["__proto__", "prototype", "constructor"].includes(key)) throw new HttpError("Backup JSON contains a forbidden property.", 400);
      stack.push({ value: (value as Record<string, unknown>)[key], depth: depth + 1 });
    }
  }
}

export function parseBackupText(text: string): BackupDocument {
  let value: unknown;
  try { value = JSON.parse(text.replace(/^\uFEFF/, "")); }
  catch { throw new HttpError("The selected file is not valid JSON.", 400); }
  assertSafeJsonStructure(value);
  const result = backupSchema.safeParse(value);
  if (!result.success) {
    const errors = result.error.issues.slice(0, 12).map((issue) => `${issue.path.join(".") || "backup"}: ${issue.message}`);
    throw new HttpError(`Invalid IEC backup. ${errors.join("; ")}`, 400);
  }
  return result.data;
}

export function safeImportFilename(value: string) {
  return value.split(/[\\/]/).pop()!.replace(/[^A-Za-z0-9._ -]/g, "_").slice(0, 180) || "backup.json";
}
