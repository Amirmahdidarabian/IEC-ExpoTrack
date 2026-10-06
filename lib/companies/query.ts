import { Prisma } from "@prisma/client";
import { z } from "zod";

export const companySorts = ["name-asc", "name-desc", "contacts-desc", "exhibitions-desc", "recent", "updated", "nearest"] as const;
export type CompanySort = typeof companySorts[number];

const booleanParam = z.enum(["true", "false"]).transform((value) => value === "true").optional();
const querySchema = z.object({
  q: z.string().trim().max(200).optional(), country: z.string().trim().max(3).optional(), category: z.string().optional(), topic: z.string().optional(),
  exhibition: z.string().optional(), priority: z.enum(["TOP", "HIGH", "MEDIUM", "LOW"]).optional(), sort: z.preprocess((value) => value === "priority-desc" || value === "priority-asc" ? "name-asc" : value, z.enum(companySorts)).default("name-asc"),
  page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().pipe(z.union([z.literal(25), z.literal(50), z.literal(100)])).default(50),
  hasContact: booleanParam, hasEmail: booleanParam, hasLinkedIn: booleanParam, hasWebsite: booleanParam,
  minContacts: z.coerce.number().int().min(0).max(10000).optional(), maxContacts: z.coerce.number().int().min(0).max(10000).optional(), company: z.string().optional(),
});

export type CompanyQuery = z.infer<typeof querySchema>;

export function parseCompanyQuery(input: Record<string, string | string[] | undefined>): CompanyQuery {
  const scalar = Object.fromEntries(Object.entries(input).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]).filter(([, value]) => value !== undefined && value !== ""));
  const parsed = querySchema.safeParse(scalar);
  return parsed.success ? parsed.data : querySchema.parse({});
}

export function companyWhere(query: CompanyQuery): Prisma.CompanyWhereInput {
  const filters: Prisma.CompanyWhereInput[] = [];
  if (query.q) filters.push({ OR: [
    { name: { contains: query.q, mode: "insensitive" } }, { normalizedName: { contains: query.q.toLocaleLowerCase("en-US"), mode: "insensitive" } },
    { domain: { contains: query.q, mode: "insensitive" } }, { website: { contains: query.q, mode: "insensitive" } }, { country: { contains: query.q, mode: "insensitive" } },
    { contacts: { some: { OR: [{ firstName: { contains: query.q, mode: "insensitive" } }, { lastName: { contains: query.q, mode: "insensitive" } }, { email: { contains: query.q, mode: "insensitive" } }] } } },
    { categories: { some: { category: { name: { contains: query.q, mode: "insensitive" } } } } }, { topics: { some: { topic: { name: { contains: query.q, mode: "insensitive" } } } } },
  ] });
  if (query.country) filters.push({ countryCode: query.country.toUpperCase() });
  if (query.category) filters.push({ categories: { some: { categoryId: query.category } } });
  if (query.topic) filters.push({ topics: { some: { topicId: query.topic } } });
  if (query.exhibition) filters.push({ exhibitions: { some: { exhibitionId: query.exhibition } } });
  if (query.priority) {
    const ranges = { TOP: [90, 100], HIGH: [75, 89], MEDIUM: [50, 74], LOW: [0, 49] } as const;
    filters.push({ priorityScore: { gte: ranges[query.priority][0], lte: ranges[query.priority][1] } });
  }
  if (query.hasContact !== undefined) filters.push({ contacts: query.hasContact ? { some: {} } : { none: {} } });
  if (query.hasEmail !== undefined) filters.push({ contacts: query.hasEmail ? { some: { email: { not: null } } } : { none: { email: { not: null } } } });
  if (query.hasLinkedIn !== undefined) filters.push(query.hasLinkedIn
    ? { OR: [{ contacts: { some: { linkedinUrl: { not: null } } } }, { socialLinks: { some: { platform: "LINKEDIN" } } }] }
    : { AND: [{ contacts: { none: { linkedinUrl: { not: null } } } }, { socialLinks: { none: { platform: "LINKEDIN" } } }] });
  if (query.hasWebsite !== undefined) filters.push({ website: query.hasWebsite ? { not: null } : null });
  return filters.length ? { AND: filters } : {};
}

export function companyOrderBy(sort: CompanySort): Prisma.CompanyOrderByWithRelationInput[] {
  const stable: Prisma.CompanyOrderByWithRelationInput = { id: "asc" };
  const map: Record<CompanySort, Prisma.CompanyOrderByWithRelationInput[]> = {
    "name-asc": [{ name: "asc" }, stable], "name-desc": [{ name: "desc" }, stable],
    "contacts-desc": [{ contacts: { _count: "desc" } }, { name: "asc" }, stable], "exhibitions-desc": [{ exhibitions: { _count: "desc" } }, { name: "asc" }, stable],
    recent: [{ createdAt: "desc" }, stable], updated: [{ updatedAt: "desc" }, stable],
    nearest: [{ exhibitions: { _count: "desc" } }, { priorityScore: { sort: "desc", nulls: "last" } }, stable],
  };
  return map[sort];
}
