import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { canonicalWebsite, normalizeCompanyName, normalizeDomain, normalizeEmail } from "./normalization";
import { companyOrderBy, companyWhere, type CompanyQuery } from "./query";
import { companyPrioritySchema, companySchema, contactSchema, exhibitionLinkSchema, noteSchema, taxonomyLinksSchema, type CompanyInput } from "./schema";

export class DuplicateCompanyError extends Error {
  code = "DUPLICATE_COMPANY" as const;
  constructor(public duplicates: { id: string; name: string; domain: string | null; country: string | null }[]) { super("A matching company already exists."); }
}

const companyListSelect = {
  id: true, name: true, website: true, domain: true, countryCode: true, country: true, priorityScore: true, saved: true, createdAt: true, updatedAt: true,
  contacts: { take: 3, orderBy: [{ isPrimary: "desc" as const }, { createdAt: "asc" as const }], select: { id: true, firstName: true, lastName: true, jobTitle: true, email: true } },
  categories: { take: 3, orderBy: { category: { name: "asc" as const } }, select: { category: { select: { id: true, name: true } } } },
  topics: { take: 3, orderBy: { topic: { name: "asc" as const } }, select: { topic: { select: { id: true, name: true } } } },
  exhibitions: { take: 2, orderBy: { exhibition: { startDate: "asc" as const } }, select: { id: true, role: true, exhibition: { select: { id: true, slug: true, name: true, startDate: true, country: true, city: true } } } },
  _count: { select: { contacts: true, categories: true, topics: true, exhibitions: true } },
} satisfies Prisma.CompanySelect;

export async function listCompanies(query: CompanyQuery) {
  const countIds = query.sort !== "nearest" && (query.minContacts !== undefined || query.maxContacts !== undefined) ? await contactCountCompanyIds(query.minContacts, query.maxContacts) : null;
  const baseWhere = companyWhere(query); const where: Prisma.CompanyWhereInput = countIds ? { AND: [baseWhere, { id: { in: countIds } }] } : baseWhere;
  const skip = (query.page - 1) * query.pageSize;
  const now = new Date();
  const nearestIds = query.sort === "nearest" ? await nearestCompanyIds(query, skip, query.pageSize) : null;
  const [items, total, companyTotal, countries, industries, countryOptions, categories, topics, exhibitions] = await Promise.all([
    prisma.company.findMany({ where: nearestIds ? { AND: [where, { id: { in: nearestIds } }] } : where, select: companyListSelect, orderBy: nearestIds ? undefined : companyOrderBy(query.sort), skip: nearestIds ? undefined : skip, take: nearestIds ? undefined : query.pageSize }),
    prisma.company.count({ where }), prisma.company.count(), prisma.company.groupBy({ by: ["countryCode"] }), prisma.industryCategory.count({ where: { companies: { some: {} } } }),
    prisma.company.findMany({ distinct: ["countryCode"], where: { countryCode: { not: null } }, select: { countryCode: true, country: true }, orderBy: { countryCode: "asc" } }),
    prisma.industryCategory.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.topic.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.exhibition.findMany({ select: { id: true, name: true, startDate: true }, orderBy: { startDate: "asc" }, take: 1000 }),
  ]);
  if (nearestIds) items.sort((a, b) => nearestIds.indexOf(a.id) - nearestIds.indexOf(b.id));
  return {
    items: items.map((item) => ({ ...item, contactsCount: item._count.contacts, categoriesCount: item._count.categories, topicsCount: item._count.topics, exhibitionsCount: item._count.exhibitions,
      categories: item.categories.map((entry) => entry.category), topics: item.topics.map((entry) => entry.topic),
      exhibitions: item.exhibitions.sort((a, b) => Math.abs(a.exhibition.startDate.getTime() - now.getTime()) - Math.abs(b.exhibition.startDate.getTime() - now.getTime())), _count: undefined })),
    total, page: query.page, pageSize: query.pageSize, pageCount: Math.max(1, Math.ceil(total / query.pageSize)),
    stats: { total: companyTotal, countries: countries.filter((item) => item.countryCode).length, industries },
    options: { countries: countryOptions, categories, topics, exhibitions },
  };
}

async function contactCountCompanyIds(minimum?: number, maximum?: number) {
  const minimumSql = minimum === undefined ? Prisma.empty : Prisma.sql`AND (SELECT COUNT(*) FROM "CompanyContact" cc WHERE cc."companyId" = c."id") >= ${minimum}`;
  const maximumSql = maximum === undefined ? Prisma.empty : Prisma.sql`AND (SELECT COUNT(*) FROM "CompanyContact" cc WHERE cc."companyId" = c."id") <= ${maximum}`;
  const rows = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT c."id" FROM "Company" c WHERE true ${minimumSql} ${maximumSql}`);
  return rows.map((row) => row.id);
}

async function nearestCompanyIds(query: CompanyQuery, skip: number, take: number) {
  const conditions: Prisma.Sql[] = [];
  if (query.q) { const term = `%${query.q}%`; conditions.push(Prisma.sql`(c."name" ILIKE ${term} OR c."normalizedName" ILIKE ${term} OR c."domain" ILIKE ${term} OR c."website" ILIKE ${term} OR c."country" ILIKE ${term} OR EXISTS (SELECT 1 FROM "CompanyContact" cc WHERE cc."companyId" = c."id" AND (cc."firstName" ILIKE ${term} OR cc."lastName" ILIKE ${term} OR cc."email" ILIKE ${term})) OR EXISTS (SELECT 1 FROM "CompanyCategory" ck JOIN "IndustryCategory" k ON k."id" = ck."categoryId" WHERE ck."companyId" = c."id" AND k."name" ILIKE ${term}) OR EXISTS (SELECT 1 FROM "CompanyTopic" ct JOIN "Topic" t ON t."id" = ct."topicId" WHERE ct."companyId" = c."id" AND t."name" ILIKE ${term}))`); }
  if (query.country) conditions.push(Prisma.sql`c."countryCode" = ${query.country.toUpperCase()}`);
  if (query.category) conditions.push(Prisma.sql`EXISTS (SELECT 1 FROM "CompanyCategory" ck WHERE ck."companyId" = c."id" AND ck."categoryId" = ${query.category})`);
  if (query.topic) conditions.push(Prisma.sql`EXISTS (SELECT 1 FROM "CompanyTopic" ct WHERE ct."companyId" = c."id" AND ct."topicId" = ${query.topic})`);
  if (query.exhibition) conditions.push(Prisma.sql`EXISTS (SELECT 1 FROM "CompanyExhibition" ce WHERE ce."companyId" = c."id" AND ce."exhibitionId" = ${query.exhibition})`);
  if (query.priority) { const ranges = { TOP: [90, 100], HIGH: [75, 89], MEDIUM: [50, 74], LOW: [0, 49] } as const; conditions.push(Prisma.sql`c."priorityScore" BETWEEN ${ranges[query.priority][0]} AND ${ranges[query.priority][1]}`); }
  if (query.hasContact !== undefined) conditions.push(query.hasContact ? Prisma.sql`EXISTS (SELECT 1 FROM "CompanyContact" cc WHERE cc."companyId" = c."id")` : Prisma.sql`NOT EXISTS (SELECT 1 FROM "CompanyContact" cc WHERE cc."companyId" = c."id")`);
  if (query.hasEmail !== undefined) conditions.push(query.hasEmail ? Prisma.sql`EXISTS (SELECT 1 FROM "CompanyContact" cc WHERE cc."companyId" = c."id" AND cc."email" IS NOT NULL)` : Prisma.sql`NOT EXISTS (SELECT 1 FROM "CompanyContact" cc WHERE cc."companyId" = c."id" AND cc."email" IS NOT NULL)`);
  if (query.hasLinkedIn !== undefined) conditions.push(query.hasLinkedIn ? Prisma.sql`(EXISTS (SELECT 1 FROM "CompanyContact" cc WHERE cc."companyId" = c."id" AND cc."linkedinUrl" IS NOT NULL) OR EXISTS (SELECT 1 FROM "CompanySocialLink" sl WHERE sl."companyId" = c."id" AND sl."platform" = 'LINKEDIN'))` : Prisma.sql`(NOT EXISTS (SELECT 1 FROM "CompanyContact" cc WHERE cc."companyId" = c."id" AND cc."linkedinUrl" IS NOT NULL) AND NOT EXISTS (SELECT 1 FROM "CompanySocialLink" sl WHERE sl."companyId" = c."id" AND sl."platform" = 'LINKEDIN'))`);
  if (query.hasWebsite !== undefined) conditions.push(query.hasWebsite ? Prisma.sql`c."website" IS NOT NULL` : Prisma.sql`c."website" IS NULL`);
  if (query.minContacts !== undefined) conditions.push(Prisma.sql`(SELECT COUNT(*) FROM "CompanyContact" cc WHERE cc."companyId" = c."id") >= ${query.minContacts}`);
  if (query.maxContacts !== undefined) conditions.push(Prisma.sql`(SELECT COUNT(*) FROM "CompanyContact" cc WHERE cc."companyId" = c."id") <= ${query.maxContacts}`);
  const whereSql = conditions.length ? Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}` : Prisma.empty;
  const rows = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT c."id" FROM "Company" c ${whereSql} ORDER BY (SELECT MIN(e."startDate") FROM "CompanyExhibition" ce JOIN "Exhibition" e ON e."id" = ce."exhibitionId" WHERE ce."companyId" = c."id" AND e."startDate" >= CURRENT_TIMESTAMP) ASC NULLS LAST, c."priorityScore" DESC NULLS LAST, c."name" ASC, c."id" ASC LIMIT ${take} OFFSET ${skip}`);
  return rows.map((row) => row.id);
}

export async function getCompany(id: string) {
  return prisma.company.findUnique({ where: { id }, include: {
    contacts: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] }, socialLinks: { orderBy: { platform: "asc" } },
    categories: { include: { category: true }, orderBy: { category: { name: "asc" } } }, topics: { include: { topic: true }, orderBy: { topic: { name: "asc" } } },
    exhibitions: { include: { exhibition: { select: { id: true, slug: true, name: true, country: true, city: true, startDate: true, endDate: true } } }, orderBy: { exhibition: { startDate: "asc" } } },
    notes: { include: { createdBy: { select: { username: true } } }, orderBy: { createdAt: "desc" } },
  } });
}

export async function findCompanyDuplicates(input: Pick<CompanyInput, "name" | "website" | "countryCode">, excludeId?: string) {
  const normalizedName = normalizeCompanyName(input.name); const domain = normalizeDomain(input.website);
  return prisma.company.findMany({ where: { id: excludeId ? { not: excludeId } : undefined, OR: [domain ? { domain } : undefined, { normalizedName, countryCode: input.countryCode || undefined }].filter(Boolean) as Prisma.CompanyWhereInput[] }, select: { id: true, name: true, domain: true, country: true }, take: 10 });
}

function scalarData(input: CompanyInput) {
  const domain = normalizeDomain(input.website);
  return { name: input.name.trim(), normalizedName: normalizeCompanyName(input.name), website: canonicalWebsite(input.website), domain,
    countryCode: input.countryCode?.toUpperCase() || null, country: input.country || null, description: input.description || null, priorityScore: input.priorityScore ?? null };
}

export async function createCompany(raw: unknown, actorId: string, allowDuplicate = false) {
  const input = companySchema.parse(raw); const duplicates = await findCompanyDuplicates(input);
  if (duplicates.length && !allowDuplicate) throw new DuplicateCompanyError(duplicates);
  return prisma.$transaction(async (tx) => {
    const company = await tx.company.create({ data: { ...scalarData(input), saved: input.saved ?? false, createdById: actorId,
      categories: { create: input.categoryIds.map((categoryId) => ({ categoryId })) }, topics: { create: input.topicIds.map((topicId) => ({ topicId })) },
      socialLinks: { create: input.socialLinks }, contacts: input.initialContact ? { create: { ...input.initialContact, email: normalizeEmail(input.initialContact.email) } } : undefined }, select: { id: true, name: true } });
    await tx.auditLog.create({ data: { actorUserId: actorId, action: "COMPANY_CREATED", entityType: "COMPANY", entityId: company.id, entityLabel: company.name, description: `Created company ${company.name}` } });
    return company;
  });
}

export async function updateCompany(id: string, raw: unknown, actorId: string, allowDuplicate = false) {
  const input = companySchema.parse(raw); const duplicates = await findCompanyDuplicates(input, id);
  if (duplicates.length && !allowDuplicate) throw new DuplicateCompanyError(duplicates);
  return prisma.$transaction(async (tx) => {
    const company = await tx.company.update({ where: { id }, data: {
      ...scalarData(input),
      socialLinks: { deleteMany: {}, create: input.socialLinks },
      categories: { deleteMany: {}, create: [...new Set(input.categoryIds)].map((categoryId) => ({ categoryId })) },
      topics: { deleteMany: {}, create: [...new Set(input.topicIds)].map((topicId) => ({ topicId })) },
    }, select: { id: true, name: true } });
    await tx.auditLog.create({ data: { actorUserId: actorId, action: "COMPANY_UPDATED", entityType: "COMPANY", entityId: id, entityLabel: company.name, description: `Updated company ${company.name}` } }); return company;
  });
}

export async function updateCompanyPriority(id: string, raw: unknown, actorId: string) {
  const input = companyPrioritySchema.parse(raw);
  return prisma.$transaction(async (tx) => {
    const company = await tx.company.update({ where: { id }, data: { priorityScore: input.priorityScore }, select: { id: true, name: true, priorityScore: true } });
    await tx.auditLog.create({ data: { actorUserId: actorId, action: "COMPANY_UPDATED", entityType: "COMPANY", entityId: id, entityLabel: company.name, description: input.priorityScore == null ? "Cleared company priority" : `Set company priority to ${input.priorityScore}` } });
    return company;
  });
}

export async function deleteCompany(id: string, actorId: string) {
  return prisma.$transaction(async (tx) => { const company = await tx.company.findUniqueOrThrow({ where: { id }, select: { name: true } }); await tx.company.delete({ where: { id } });
    await tx.auditLog.create({ data: { actorUserId: actorId, action: "COMPANY_DELETED", entityType: "COMPANY", entityId: id, entityLabel: company.name, description: `Deleted company ${company.name}` } }); });
}

export async function deleteCompanies(ids: string[], actorId: string) {
  const uniqueIds = [...new Set(ids)];
  return prisma.$transaction(async (tx) => {
    const companies = await tx.company.findMany({ where: { id: { in: uniqueIds } }, select: { id: true, name: true } });
    if (companies.length !== uniqueIds.length) throw Object.assign(new Error("One or more companies were not found."), { code: "P2025" });
    await tx.company.deleteMany({ where: { id: { in: uniqueIds } } });
    await tx.auditLog.createMany({ data: companies.map((company) => ({ actorUserId: actorId, action: "COMPANY_DELETED" as const, entityType: "COMPANY" as const, entityId: company.id, entityLabel: company.name, description: `Deleted company ${company.name}` })) });
    return companies.length;
  });
}

async function setPrimary(tx: Prisma.TransactionClient, companyId: string) { await tx.companyContact.updateMany({ where: { companyId, isPrimary: true }, data: { isPrimary: false } }); }
export async function createContact(companyId: string, raw: unknown, actorId: string) { const input = contactSchema.parse(raw); return prisma.$transaction(async (tx) => {
  if (input.isPrimary) await setPrimary(tx, companyId); const contact = await tx.companyContact.create({ data: { ...input, email: normalizeEmail(input.email), companyId } });
  await tx.auditLog.create({ data: { actorUserId: actorId, action: "CONTACT_CREATED", entityType: "CONTACT", entityId: contact.id, entityLabel: [contact.firstName, contact.lastName].filter(Boolean).join(" ") || contact.email || "General Contact", description: `Added contact to company ${companyId}` } }); return contact; }); }
export async function updateContact(companyId: string, contactId: string, raw: unknown, actorId: string) { const input = contactSchema.parse(raw); return prisma.$transaction(async (tx) => {
  if (input.isPrimary) await setPrimary(tx, companyId); const contact = await tx.companyContact.update({ where: { id: contactId, companyId }, data: { ...input, email: normalizeEmail(input.email) } });
  await tx.auditLog.create({ data: { actorUserId: actorId, action: "CONTACT_UPDATED", entityType: "CONTACT", entityId: contact.id, description: `Updated contact for company ${companyId}` } }); return contact; }); }
export async function deleteContact(companyId: string, contactId: string, actorId: string) { return prisma.$transaction(async (tx) => { await tx.companyContact.delete({ where: { id: contactId, companyId } }); await tx.auditLog.create({ data: { actorUserId: actorId, action: "CONTACT_DELETED", entityType: "CONTACT", entityId: contactId, description: `Deleted contact from company ${companyId}` } }); }); }

export async function updateTaxonomyLinks(companyId: string, raw: unknown, actorId: string) { const input = taxonomyLinksSchema.parse(raw); return prisma.$transaction(async (tx) => {
  if (input.categoryIds) { await tx.companyCategory.deleteMany({ where: { companyId } }); await tx.companyCategory.createMany({ data: [...new Set(input.categoryIds)].map((categoryId) => ({ companyId, categoryId })) }); }
  if (input.topicIds) { await tx.companyTopic.deleteMany({ where: { companyId } }); await tx.companyTopic.createMany({ data: [...new Set(input.topicIds)].map((topicId) => ({ companyId, topicId })) }); }
  const company = await tx.company.findUniqueOrThrow({ where: { id: companyId }, select: { name: true } });
  await tx.auditLog.createMany({ data: [input.categoryIds ? { actorUserId: actorId, action: "COMPANY_CATEGORY_UPDATED" as const, entityType: "COMPANY" as const, entityId: companyId, entityLabel: company.name, description: "Updated company categories" } : null, input.topicIds ? { actorUserId: actorId, action: "COMPANY_TOPIC_UPDATED" as const, entityType: "COMPANY" as const, entityId: companyId, entityLabel: company.name, description: "Updated company topics" } : null].filter((item): item is NonNullable<typeof item> => item !== null) });
}); }

export async function linkExhibition(companyId: string, raw: unknown, actorId: string) { const input = exhibitionLinkSchema.parse(raw); return prisma.$transaction(async (tx) => { const link = await tx.companyExhibition.create({ data: { companyId, ...input } }); await tx.auditLog.create({ data: { actorUserId: actorId, action: "COMPANY_EXHIBITION_LINKED", entityType: "COMPANY", entityId: companyId, description: `Linked exhibition ${input.exhibitionId}` } }); return link; }); }
export async function unlinkExhibition(companyId: string, linkId: string, actorId: string) { return prisma.$transaction(async (tx) => { const link = await tx.companyExhibition.delete({ where: { id: linkId, companyId } }); await tx.auditLog.create({ data: { actorUserId: actorId, action: "COMPANY_EXHIBITION_UNLINKED", entityType: "COMPANY", entityId: companyId, description: `Unlinked exhibition ${link.exhibitionId}` } }); }); }
export async function createNote(companyId: string, raw: unknown, actorId: string) { const input = noteSchema.parse(raw); return prisma.$transaction(async (tx) => { const note = await tx.companyNote.create({ data: { companyId, body: input.body, createdById: actorId } }); await tx.auditLog.create({ data: { actorUserId: actorId, action: "COMPANY_NOTE_CREATED", entityType: "COMPANY", entityId: companyId, description: "Added company note" } }); return note; }); }
export async function updateNote(companyId: string, noteId: string, raw: unknown, actorId: string) { const input = noteSchema.parse(raw); return prisma.$transaction(async (tx) => { const note = await tx.companyNote.update({ where: { id: noteId, companyId }, data: input }); await tx.auditLog.create({ data: { actorUserId: actorId, action: "COMPANY_NOTE_UPDATED", entityType: "COMPANY", entityId: companyId, description: "Updated company note" } }); return note; }); }
export async function deleteNote(companyId: string, noteId: string, actorId: string) { return prisma.$transaction(async (tx) => { await tx.companyNote.delete({ where: { id: noteId, companyId } }); await tx.auditLog.create({ data: { actorUserId: actorId, action: "COMPANY_NOTE_DELETED", entityType: "COMPANY", entityId: companyId, description: "Deleted company note" } }); }); }
export async function toggleCompanySaved(id: string) { const item = await prisma.company.findUniqueOrThrow({ where: { id }, select: { saved: true } }); return prisma.company.update({ where: { id }, data: { saved: !item.saved }, select: { saved: true } }); }
