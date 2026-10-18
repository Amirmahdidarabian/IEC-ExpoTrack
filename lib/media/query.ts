import { Prisma } from "@prisma/client";
import { z } from "zod";
export const mediaSorts = ["name-asc", "name-desc", "contacts-desc", "recent", "updated", "country", "category"] as const;
const bool = z.enum(["true", "false"]).transform(v => v === "true").optional();
const schema = z.object({
  q: z.string().trim().max(200).optional(), location: z.string().max(500).optional(), category: z.string().max(200).optional(), rawCategory: z.string().max(1000).optional(), topic: z.string().max(200).optional(),
  hasEmail: bool, hasWebsite: bool, hasContactPage: bool,
  minContacts: z.coerce.number().int().min(0).max(10000).optional(), maxContacts: z.coerce.number().int().min(0).max(10000).optional(), updatedDays: z.coerce.number().pipe(z.union([z.literal(7), z.literal(30), z.literal(90)])).optional(),
  sort: z.enum(mediaSorts).default("name-asc"), page: z.coerce.number().int().min(1).max(1000000).default(1), pageSize: z.union([z.literal("all"),z.coerce.number().pipe(z.union([z.literal(25), z.literal(50), z.literal(100)]))]).default(25),
});
export type MediaQuery = z.infer<typeof schema>;
export function parseMediaQuery(input: Record<string, string | string[] | undefined>): MediaQuery {
  const values = Object.fromEntries(Object.entries(input).map(([k,v]) => [k, Array.isArray(v) ? v[0] : v]).filter(([,v]) => v !== undefined && v !== ""));
  return schema.parse(values);
}
export function mediaWhere(q: MediaQuery): Prisma.MediaOutletWhereInput {
  const conditions: Prisma.MediaOutletWhereInput[] = [];
  if (q.q) {
    const term = { contains: q.q, mode: "insensitive" as const };
    conditions.push({ OR: [{name:term},{websiteUrl:term},{domain:term},{sourceCategoryRaw:term},{countryName:term},{publicationScopeRaw:term},{contacts:{some:{OR:[{email:term},{roleLabel:term},{name:term},{department:term}]}}},{categories:{some:{category:{name:term}}}},{topics:{some:{topic:{name:term}}}}] });
  }
  if (q.location) conditions.push({ OR: [{countryCode:q.location},{publicationScopeRaw:q.location}] });
  if (q.category) conditions.push({categories:{some:{categoryId:q.category}}});
  if (q.rawCategory) conditions.push({sourceCategoryRaw:q.rawCategory});
  if (q.topic) conditions.push({topics:{some:{topicId:q.topic}}});
  if (q.hasWebsite !== undefined) conditions.push({ websiteUrl: q.hasWebsite ? {not:null} : null });
  if (q.hasEmail !== undefined) conditions.push(q.hasEmail ? {contacts:{some:{email:{not:null}}}} : {contacts:{none:{email:{not:null}}}});
  if (q.hasContactPage !== undefined) {
    const method: Prisma.MediaContactWhereInput = {OR:[{contactPageUrl:{not:null}},{contactMethod:"WEBSITE_FORM"}]};
    conditions.push(q.hasContactPage ? {contacts:{some:method}} : {contacts:{none:method}});
  }
  if (q.updatedDays) conditions.push({updatedAt:{gte:new Date(Date.now()-q.updatedDays*86400000)}});
  return conditions.length ? {AND:conditions} : {};
}
export function mediaOrder(sort: MediaQuery["sort"]): Prisma.MediaOutletOrderByWithRelationInput[] {
  const primary: Prisma.MediaOutletOrderByWithRelationInput = sort === "name-desc" ? {name:"desc"} : sort === "contacts-desc" ? {contacts:{_count:"desc"}} : sort === "recent" ? {createdAt:"desc"} : sort === "updated" ? {updatedAt:"desc"} : sort === "country" ? {countryName:"asc"} : sort === "category" ? {sourceCategoryRaw:"asc"} : {name:"asc"};
  return [primary, {id:"asc"}];
}
