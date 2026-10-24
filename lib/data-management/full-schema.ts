import { AuditAction, AuditEntityType, CompanyExhibitionRole, CompanyImportStatus, CompanySocialPlatform, MediaContactMethod, MediaImportStatus, Permission, UserRole } from "@prisma/client";
import { z } from "zod";
import { folderColors } from "@/lib/companies/folder-schema";

const id = z.string().min(1).max(191).regex(/^[A-Za-z0-9_-]+$/);
const date = z.string().datetime({ offset: true });
const text = z.string().max(100_000);
const nullableText = text.nullable();
const url = z.string().max(2048).refine(value => { try { return ["http:", "https:"].includes(new URL(value).protocol); } catch { return false; } }, "Only HTTP(S) URLs are allowed");
const nullableUrl = url.nullable();
const timestamps = { createdAt: date, updatedAt: date };
const count = z.number().int().min(0).max(10_000_000);
const json = z.json();
const social = z.object({ id, platform: z.nativeEnum(CompanySocialPlatform), url }).strict();
const note = z.object({ id, body: text, createdById: id.nullable(), ...timestamps }).strict();
const classification = { categoryIds: z.array(id).max(100), topicIds: z.array(id).max(500) };
export const exhibitionActorFields = { createdById: id.nullable(), updatedById: id.nullable(), preEventEmailSentById: id.nullable(), postEventEmailSentById: id.nullable() };

const companyContact = z.object({
  id, firstName: nullableText, lastName: nullableText, jobTitle: nullableText, department: nullableText,
  email: z.email().max(320).nullable(), phone: nullableText, whatsapp: nullableText, linkedinUrl: nullableUrl,
  notes: nullableText, isPrimary: z.boolean(), ...timestamps,
}).strict();
const mediaContact = z.object({
  id, name: nullableText, roleLabel: nullableText, department: nullableText, email: z.email().max(320).nullable(), phone: nullableText,
  linkedInUrl: nullableUrl, contactPageUrl: nullableUrl, contactMethod: z.nativeEnum(MediaContactMethod), notes: nullableText,
  isPrimary: z.boolean(), position: count, sourceLabelRaw: nullableText, sourceValueRaw: nullableText, sourceSheet: nullableText,
  sourceRow: count.nullable(), importKey: nullableText, ...timestamps,
}).strict();

export const fullDataFields = {
  companyFolders: z.array(z.object({ id, name: z.string().min(1).max(100), normalizedName: z.string().min(1).max(100), description: z.string().max(600), color: z.enum(folderColors), ...timestamps }).strict()).max(10_000),
  companies: z.array(z.object({
    id, name: z.string().min(1).max(300), normalizedName: z.string().min(1).max(500), website: nullableUrl, domain: nullableText,
    countryCode: z.string().regex(/^[A-Z]{2,3}$/).nullable(), country: nullableText, description: nullableText,
    priorityScore: z.number().int().min(0).max(100).nullable(), saved: z.boolean(), createdById: id.nullable(), ...timestamps,
    ...classification, contacts: z.array(companyContact).max(10_000), socialLinks: z.array(social).max(100), notes: z.array(note).max(10_000),
    folders: z.array(z.object({ folderId: id, createdAt: date }).strict()).max(10_000),
    exhibitions: z.array(z.object({ id, exhibitionId: id, role: z.nativeEnum(CompanyExhibitionRole), hall: nullableText, booth: nullableText, sourceUrl: nullableUrl, notes: nullableText, createdAt: date }).strict()).max(25_000),
  }).strict()).max(100_000),
  media: z.array(z.object({
    id, name: z.string().min(1).max(500), normalizedName: z.string().min(1).max(1000), identityKey: nullableText,
    websiteUrl: nullableUrl, domain: nullableText, sourceCategoryRaw: nullableText, countryCode: z.string().regex(/^[A-Z]{2,3}$/).nullable(),
    countryName: nullableText, publicationScopeRaw: nullableText, description: nullableText, createdById: id.nullable(), ...timestamps,
    ...classification, contacts: z.array(mediaContact).max(10_000), socialLinks: z.array(social).max(100), notes: z.array(note).max(10_000),
    sources: z.array(z.object({ id, importJobId: id, sourceSheet: text, sourceRow: count, rawValues: json, warnings: json }).strict()).max(50_000),
  }).strict()).max(100_000),
  administration: z.object({
    users: z.array(z.object({ id, username: z.string().min(1).max(100), role: z.nativeEnum(UserRole), isActive: z.boolean(), mustChangePassword: z.boolean(), ...timestamps, lastLoginAt: date.nullable(), permissions: z.array(z.nativeEnum(Permission)).max(100) }).strict()).max(10_000),
    auditLogs: z.array(z.object({ id, actorUserId: id.nullable(), action: z.nativeEnum(AuditAction), entityType: z.nativeEnum(AuditEntityType), entityId: nullableText, entityLabel: nullableText, description: text, metadata: json, createdAt: date }).strict()).max(200_000),
    companyImportJobs: z.array(z.object({ id, fileName: text, startedById: id.nullable(), startedAt: date, completedAt: date.nullable(), status: z.nativeEnum(CompanyImportStatus), totalRows: count, validRows: count, createdCompanies: count, updatedCompanies: count, createdContacts: count, duplicates: count, failedRows: count, errorSummary: json }).strict()).max(25_000),
    mediaImportJobs: z.array(z.object({ id, fileName: text, fileHash: z.string().max(500), startedById: id.nullable(), startedAt: date, completedAt: date.nullable(), status: z.nativeEnum(MediaImportStatus), report: json }).strict()).max(25_000),
  }).strict(),
};

type FullData = z.infer<z.ZodObject<typeof fullDataFields>>;
type Context = z.RefinementCtx;
export function validateFullData(data: FullData, exhibitionIds: Set<string>, categoryIds: Set<string>, topicIds: Set<string>, actors: Array<Record<keyof typeof exhibitionActorFields, string | null>>, context: Context) {
  const issue = (path: PropertyKey[], message: string) => context.addIssue({ code: "custom", path: ["data", ...path], message });
  function unique(values: Array<string | null>, path: PropertyKey[]) { const seen = new Set<string>(); for (const value of values) { if (value === null) continue; if (seen.has(value)) issue(path, "Duplicate identity or relationship"); seen.add(value); } }
  function refs(values: Array<string | null>, allowed: Set<string>, path: PropertyKey[]) { for (const value of values) if (value !== null && !allowed.has(value)) issue(path, "Unknown relationship reference"); }
  const users = new Set(data.administration.users.map(v => v.id)), folders = new Set(data.companyFolders.map(v => v.id)), jobs = new Set(data.administration.mediaImportJobs.map(v => v.id));
  unique(data.companyFolders.map(v => v.id), ["companyFolders"]); unique(data.companyFolders.map(v => v.normalizedName), ["companyFolders"]);
  unique(data.administration.users.map(v => v.id), ["administration", "users"]); unique(data.administration.users.map(v => v.username.toLowerCase()), ["administration", "users"]);
  data.administration.users.forEach((v, i) => unique(v.permissions, ["administration", "users", i, "permissions"]));
  for (const key of ["auditLogs", "companyImportJobs", "mediaImportJobs"] as const) {
    unique(data.administration[key].map(v => v.id), ["administration", key]);
    data.administration[key].forEach((v, i) => refs(["actorUserId" in v ? v.actorUserId : v.startedById], users, ["administration", key, i]));
  }
  actors.forEach((v, i) => refs(Object.values(v), users, ["exhibitions", i]));
  for (const key of ["companies", "media"] as const) {
    unique(data[key].map(v => v.id), [key]);
    const contactIds: string[] = [], noteIds: string[] = [], socialIds: string[] = [], sourceIds: string[] = [];
    data[key].forEach((v, i) => {
      const path = [key, i];
      unique(v.categoryIds, [...path, "categoryIds"]); unique(v.topicIds, [...path, "topicIds"]);
      refs(v.categoryIds, categoryIds, [...path, "categoryIds"]); refs(v.topicIds, topicIds, [...path, "topicIds"]); refs([v.createdById, ...v.notes.map(n => n.createdById)], users, path);
      contactIds.push(...v.contacts.map(c => c.id)); noteIds.push(...v.notes.map(n => n.id)); socialIds.push(...v.socialLinks.map(s => s.id));
      unique(v.socialLinks.map(s => `${s.platform}:${s.url}`), [...path, "socialLinks"]);
      if (v.contacts.filter(c => c.isPrimary).length > 1) issue([...path, "contacts"], "Only one primary contact is allowed");
      if ("folders" in v) {
        unique(v.contacts.map(c => c.email?.toLowerCase() ?? null), [...path, "contacts"]);
        unique(v.folders.map(f => f.folderId), [...path, "folders"]); refs(v.folders.map(f => f.folderId), folders, [...path, "folders"]);
        unique(v.exhibitions.map(e => e.exhibitionId), [...path, "exhibitions"]); refs(v.exhibitions.map(e => e.exhibitionId), exhibitionIds, [...path, "exhibitions"]);
        sourceIds.push(...v.exhibitions.map(e => e.id));
      } else {
        unique(v.contacts.map(c => c.importKey), [...path, "contacts"]);
        refs(v.sources.map(s => s.importJobId), jobs, [...path, "sources"]);
        sourceIds.push(...v.sources.map(s => s.id));
      }
    });
    unique(contactIds, [key, "contacts"]); unique(noteIds, [key, "notes"]); unique(socialIds, [key, "socialLinks"]); unique(sourceIds, [key, "links"]);
  }
  unique(data.media.map(v => v.identityKey), ["media", "identityKey"]);
  unique(data.media.flatMap(v => v.sources.map(s => JSON.stringify([s.importJobId, s.sourceSheet, s.sourceRow]))), ["media", "sources"]);
}
