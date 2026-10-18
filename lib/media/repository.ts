import { Prisma, type AuditAction } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/auth/errors";
import { getCountryOption } from "@/lib/locations";
import { cleanText, mediaIdentity, normalizedMediaName, normalizeMediaUrl, conservativeCategoryName } from "./normalization";
import { mediaClassificationSchema, mediaContactPatchSchema, mediaContactSchema, mediaNoteSchema, mediaPatchSchema, mediaSchema } from "./schema";
import { mediaOrder, mediaWhere, type MediaQuery } from "./query";
import { mediaPagination } from "./pagination";

export class DuplicateMediaError extends HttpError {
  constructor(public duplicates: {id:string;name:string;websiteUrl:string|null}[]) { super("A publication with the same or a similar identity exists. Review it before adding another.",409); }
}
const summarySelect = {
  id:true,name:true,websiteUrl:true,domain:true,sourceCategoryRaw:true,countryCode:true,countryName:true,publicationScopeRaw:true,createdAt:true,updatedAt:true,
  contacts:{take:3,orderBy:[{isPrimary:"desc"},{position:"asc"},{id:"asc"}],select:{id:true,name:true,roleLabel:true,contactMethod:true}},
  categories:{take:3,orderBy:{category:{name:"asc"}},select:{category:{select:{id:true,name:true}}}},
  _count:{select:{contacts:true}},
} satisfies Prisma.MediaOutletSelect;

export async function mediaOptions() {
  const [locations,rawCategories,categories,topics] = await Promise.all([
    prisma.mediaOutlet.findMany({distinct:["countryCode","publicationScopeRaw"],select:{countryCode:true,countryName:true,publicationScopeRaw:true},take:1000,orderBy:{countryName:"asc"}}),
    prisma.mediaOutlet.findMany({distinct:["sourceCategoryRaw"],where:{sourceCategoryRaw:{not:null}},select:{sourceCategoryRaw:true},take:1000,orderBy:{sourceCategoryRaw:"asc"}}),
    prisma.industryCategory.findMany({select:{id:true,name:true},orderBy:{name:"asc"},take:1000}),prisma.topic.findMany({select:{id:true,name:true},orderBy:{name:"asc"},take:1000}),
  ]);
  return {locations:locations.flatMap(v=>v.countryCode?[{value:v.countryCode,label:v.countryName??v.countryCode}]:v.publicationScopeRaw?[{value:v.publicationScopeRaw,label:v.publicationScopeRaw}]:[]),rawCategories:rawCategories.flatMap(v=>v.sourceCategoryRaw?[v.sourceCategoryRaw]:[]),categories,topics};
}
export async function listMedia(query: MediaQuery) {
  let where = mediaWhere(query);
  if (query.minContacts !== undefined || query.maxContacts !== undefined) {
    const minimum = query.minContacts ?? 0, maximum = query.maxContacts ?? 2147483647;
    const ids = await prisma.$queryRaw<{id:string}[]>(Prisma.sql`SELECT m."id" FROM "MediaOutlet" m LEFT JOIN "MediaContact" c ON c."mediaOutletId"=m."id" GROUP BY m."id" HAVING COUNT(c."id") BETWEEN ${minimum} AND ${maximum}`);
    where = {AND:[where,{id:{in:ids.map(v=>v.id)}}]};
  }
  const total = await prisma.mediaOutlet.count({where});
  const { pageCount, page, skip, take } = mediaPagination(total, query.pageSize, query.page);
  const [items,outletCount,contactCount,countryCount,scopeCount] = await Promise.all([
    prisma.mediaOutlet.findMany({where,select:summarySelect,orderBy:mediaOrder(query.sort),skip,take}),
    prisma.mediaOutlet.count(),prisma.mediaContact.count(),prisma.mediaOutlet.groupBy({by:["countryCode"],where:{countryCode:{not:null}}}),prisma.mediaOutlet.groupBy({by:["publicationScopeRaw"],where:{countryCode:null,publicationScopeRaw:{not:null}}}),
  ]);
  return {items:items.map(v=>({...v,contactsCount:v._count.contacts,categories:v.categories.map(c=>c.category),_count:undefined})),total,page,pageSize:query.pageSize,pageCount,stats:{outlets:outletCount,contacts:contactCount,locations:countryCount.length+scopeCount.length}};
}
export async function getMedia(id: string) {
  const item = await prisma.mediaOutlet.findUnique({where:{id},include:{
    contacts:{orderBy:[{position:"asc"},{id:"asc"}]},socialLinks:{orderBy:{platform:"asc"}},
    categories:{include:{category:true}},topics:{include:{topic:true}},notes:{include:{createdBy:{select:{username:true}}},orderBy:{createdAt:"desc"}},
    sources:{orderBy:[{importJob:{startedAt:"desc"}},{sourceRow:"asc"}],take:150,select:{sourceSheet:true,sourceRow:true,warnings:true,importJob:{select:{id:true,fileName:true,startedAt:true}}}},
  }});
  if (!item) throw new HttpError("Media outlet not found.",404);
  const categories = await prisma.industryCategory.findMany({select:{id:true,name:true},take:1000});
  return {...item,suggestedCategories:item.sourceCategoryRaw?categories.filter(v=>conservativeCategoryName(v.name)===conservativeCategoryName(item.sourceCategoryRaw!)):[]};
}
async function validateLocation(code?: string|null) { if (!code) return undefined; const country=await getCountryOption(code); if (!/^[A-Z]{2}$/.test(code) || !country) throw new HttpError("Choose a valid ISO country code, or leave it blank and enter a region/scope.",400); return country.name; }
async function audit(tx: Prisma.TransactionClient, action: AuditAction, actorId: string, id: string, description: string) {
  await tx.auditLog.create({data:{actorUserId:actorId,action,entityType:action.startsWith("MEDIA_CONTACT")?"MEDIA_CONTACT":"MEDIA",entityId:id,description}});
}
async function lockOutlet(tx: Prisma.TransactionClient,id:string) {
  const records = await tx.$queryRaw<{id:string}[]>(Prisma.sql`SELECT "id" FROM "MediaOutlet" WHERE "id"=${id} FOR UPDATE`);
  if (!records.length) throw new HttpError("Media outlet not found.",404);
}
async function validateLinks(tx:Prisma.TransactionClient,categories?:string[],topics?:string[]) {
  if (categories && await tx.industryCategory.count({where:{id:{in:[...new Set(categories)]}}}) !== new Set(categories).size) throw new HttpError("One or more categories no longer exist.",400);
  if (topics && await tx.topic.count({where:{id:{in:[...new Set(topics)]}}}) !== new Set(topics).size) throw new HttpError("One or more topics no longer exist.",400);
}
export async function createMedia(raw:unknown,actorId:string,allowSimilar=false) {
  const input = mediaSchema.parse(raw); const countryName=await validateLocation(input.countryCode); if(countryName)input.countryName=countryName;
  const duplicates = await prisma.mediaOutlet.findMany({where:{normalizedName:normalizedMediaName(input.name)},select:{id:true,name:true,websiteUrl:true},take:10});
  if(duplicates.length&&!allowSimilar) throw new DuplicateMediaError(duplicates);
  const {categoryIds=[],topicIds=[],socialLinks=[],initialContact,...scalars} = input;
  return prisma.$transaction(async tx=>{
    await validateLinks(tx,categoryIds,topicIds);
    const websiteUrl=normalizeMediaUrl(input.websiteUrl);
    const item=await tx.mediaOutlet.create({data:{...scalars,name:cleanText(input.name),normalizedName:normalizedMediaName(input.name),identityKey:websiteUrl?mediaIdentity(input.name,websiteUrl):null,websiteUrl,domain:websiteUrl?new URL(websiteUrl).hostname:null,createdById:actorId,
      categories:{create:[...new Set(categoryIds)].map(categoryId=>({categoryId}))},topics:{create:[...new Set(topicIds)].map(topicId=>({topicId}))},socialLinks:{create:socialLinks},contacts:initialContact?{create:{...initialContact,contactMethod:initialContact.email?"EMAIL":initialContact.contactPageUrl?"CONTACT_PAGE":initialContact.contactMethod??"OTHER"}}:undefined}});
    await audit(tx,"MEDIA_CREATED",actorId,item.id,"Created media outlet"); return item;
  });
}
export async function updateMedia(id:string,raw:unknown,actorId:string) {
  const input=mediaPatchSchema.parse(raw); const countryName=await validateLocation(input.countryCode); if(countryName)input.countryName=countryName;
  return prisma.$transaction(async tx=>{
    await lockOutlet(tx,id); await validateLinks(tx,input.categoryIds,input.topicIds);
    const existing=await tx.mediaOutlet.findUniqueOrThrow({where:{id}});
    if(input.sourceCategoryRaw!==undefined&&input.sourceCategoryRaw!==existing.sourceCategoryRaw&&await tx.mediaImportSource.count({where:{mediaOutletId:id}}))throw new HttpError("The imported raw category is preserved. Use Categories & Topics to change classifications.",400);
    const {categoryIds,topicIds,socialLinks,...scalars}=input;
    const name=input.name??existing.name,websiteUrl=input.websiteUrl===undefined?existing.websiteUrl:normalizeMediaUrl(input.websiteUrl);
    const item=await tx.mediaOutlet.update({where:{id},data:{...scalars,normalizedName:normalizedMediaName(name),websiteUrl,domain:websiteUrl?new URL(websiteUrl).hostname:null,identityKey:websiteUrl?mediaIdentity(name,websiteUrl):null,
      categories:categoryIds?{deleteMany:{},create:[...new Set(categoryIds)].map(categoryId=>({categoryId}))}:undefined,topics:topicIds?{deleteMany:{},create:[...new Set(topicIds)].map(topicId=>({topicId}))}:undefined,socialLinks:socialLinks?{deleteMany:{},create:socialLinks}:undefined}});
    await audit(tx,"MEDIA_UPDATED",actorId,id,"Updated media outlet"); return item;
  });
}
export async function deleteMedia(id:string,actorId:string) { return prisma.$transaction(async tx=>{await lockOutlet(tx,id);await tx.mediaOutlet.delete({where:{id}});await audit(tx,"MEDIA_DELETED",actorId,id,"Deleted media outlet and its owned contacts, notes and links");}); }
export async function classifyMedia(id:string,raw:unknown,actorId:string) {
  const input=mediaClassificationSchema.parse(raw);
  return prisma.$transaction(async tx=>{await lockOutlet(tx,id);await validateLinks(tx,input.categoryIds,input.topicIds);
    await tx.mediaCategory.deleteMany({where:{mediaOutletId:id}});await tx.mediaTopic.deleteMany({where:{mediaOutletId:id}});
    await tx.mediaCategory.createMany({data:[...new Set(input.categoryIds)].map(categoryId=>({mediaOutletId:id,categoryId}))});await tx.mediaTopic.createMany({data:[...new Set(input.topicIds)].map(topicId=>({mediaOutletId:id,topicId}))});
    await tx.mediaOutlet.update({where:{id},data:{updatedAt:new Date()}}); await audit(tx,"MEDIA_CLASSIFICATION_UPDATED",actorId,id,"Updated media classification links; raw imported category preserved");
  });
}
export async function saveMediaContact(outletId:string,raw:unknown,actorId:string,contactId?:string) {
  return prisma.$transaction(async tx=>{
    await lockOutlet(tx,outletId);
    const existing=contactId?await tx.mediaContact.findUnique({where:{id:contactId,mediaOutletId:outletId}}):null;
    if(contactId&&!existing)throw new HttpError("Contact not found for this media outlet.",404);
    const input=mediaContactSchema.parse(existing?{...existing,...mediaContactPatchSchema.parse(raw)}:raw);
    if(input.isPrimary)await tx.mediaContact.updateMany({where:{mediaOutletId:outletId,isPrimary:true},data:{isPrimary:false}});
    const data={...input,contactMethod:input.email?"EMAIL" as const:input.contactPageUrl?"CONTACT_PAGE" as const:input.contactMethod??"OTHER" as const};
    const item=contactId?await tx.mediaContact.update({where:{id:contactId,mediaOutletId:outletId},data}):await tx.mediaContact.create({data:{...data,mediaOutletId:outletId}});
    await tx.mediaOutlet.update({where:{id:outletId},data:{updatedAt:new Date()}});
    await audit(tx,contactId?"MEDIA_CONTACT_UPDATED":"MEDIA_CONTACT_CREATED",actorId,item.id,`Changed contact for media outlet ${outletId}`);return item;
  });
}
export async function deleteMediaContact(outletId:string,id:string,actorId:string){return prisma.$transaction(async tx=>{await lockOutlet(tx,outletId);await tx.mediaContact.delete({where:{id,mediaOutletId:outletId}});await audit(tx,"MEDIA_CONTACT_DELETED",actorId,id,`Deleted contact from media outlet ${outletId}`);});}
export async function reorderMediaContacts(outletId:string,raw:unknown,actorId:string){const {ids}=z.object({ids:z.array(z.string().min(1).max(100)).max(5000)}).parse(raw);return prisma.$transaction(async tx=>{await lockOutlet(tx,outletId);const contacts=await tx.mediaContact.findMany({where:{mediaOutletId:outletId},select:{id:true}});if(new Set(ids).size!==ids.length||ids.length!==contacts.length||contacts.some(c=>!ids.includes(c.id)))throw new HttpError("Contact order must include each contact from this outlet exactly once.",400);for(const [position,id] of ids.entries())await tx.mediaContact.update({where:{id,mediaOutletId:outletId},data:{position}});await audit(tx,"MEDIA_CONTACT_UPDATED",actorId,outletId,"Reordered media contacts");});}
export async function saveMediaNote(outletId:string,raw:unknown,actorId:string,id?:string){const input=mediaNoteSchema.parse(raw);return prisma.$transaction(async tx=>{await lockOutlet(tx,outletId);const note=id?await tx.mediaNote.update({where:{id,mediaOutletId:outletId},data:input}):await tx.mediaNote.create({data:{...input,mediaOutletId:outletId,createdById:actorId}});await audit(tx,id?"MEDIA_NOTE_UPDATED":"MEDIA_NOTE_CREATED",actorId,outletId,"Changed internal media note");return note;});}
export async function deleteMediaNote(outletId:string,id:string,actorId:string){return prisma.$transaction(async tx=>{await lockOutlet(tx,outletId);await tx.mediaNote.delete({where:{id,mediaOutletId:outletId}});await audit(tx,"MEDIA_NOTE_DELETED",actorId,outletId,"Deleted internal media note");});}
