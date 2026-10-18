import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { parseMediaWorkbook, type MediaMapping, type ParsedOutlet } from "./import-parser";
import { conservativeCategoryName, mediaIdentity } from "./normalization";

type Candidate={id:string;name:string;normalizedName:string;websiteUrl:string|null;identityKey:string|null};
type PlanEntry={outlet:ParsedOutlet;action:"create"|"match"|"skip";targetId:string;reason:string};
/** Same publisher/domain/email is not evidence that two publications are identical. */
export function planMediaImport(outlets:ParsedOutlet[],existing:Candidate[],fileHash:string):PlanEntry[]{
  const known=[...existing];const plan:PlanEntry[]=[];
  for(const outlet of outlets){
    const matches=known.filter(v=>v.normalizedName===outlet.normalizedName);
    const exact=matches.filter(v=>Boolean(outlet.websiteUrl&&v.websiteUrl&&mediaIdentity(v.name,v.websiteUrl)===outlet.identityKey));
    if(exact.length===1){plan.push({outlet,action:"match",targetId:exact[0].id,reason:"Exact publication name and website identity"});continue;}
    if(matches.length){plan.push({outlet,action:"skip",targetId:"",reason:"Ambiguous/repeated name; review required before merging"});continue;}
    const id=randomUUID();const identityKey=outlet.websiteUrl?outlet.identityKey:createHash("sha256").update(`${fileHash}:${outlet.row}`).digest("hex");
    known.push({id,name:outlet.name,normalizedName:outlet.normalizedName,websiteUrl:outlet.websiteUrl,identityKey});
    plan.push({outlet,action:"create",targetId:id,reason:"New publication"});
  }
  return plan;
}
async function candidates(names:string[]){return prisma.mediaOutlet.findMany({where:{normalizedName:{in:[...new Set(names)]}},select:{id:true,name:true,normalizedName:true,websiteUrl:true,identityKey:true}});}
export function reviewMediaCategories(outlets:ParsedOutlet[],categories:{id:string;name:string}[]){const values=new Map<string,number>();for(const v of outlets)if(v.sourceCategoryRaw)values.set(v.sourceCategoryRaw,(values.get(v.sourceCategoryRaw)??0)+1);return [...values].map(([raw,count])=>({raw,count,suggestions:categories.filter(c=>conservativeCategoryName(c.name)===conservativeCategoryName(raw)),needsReview:true}));}
export async function previewMediaImport(buffer:Buffer,mapping:Partial<MediaMapping>={}){
  const parsed=await parseMediaWorkbook(buffer,mapping);const fileHash=createHash("sha256").update(buffer).digest("hex");
  const plan=planMediaImport(parsed.outlets,await candidates(parsed.outlets.map(v=>v.normalizedName)),fileHash);
  const categoryReview=reviewMediaCategories(parsed.outlets,await prisma.industryCategory.findMany({select:{id:true,name:true},take:1000}));
  return {sheet:parsed.sheet,ignoredSheets:parsed.ignoredSheets,headers:parsed.headers,mapping:parsed.mapping,fileHash,categoryReview,counts:{...parsed.counts,create:plan.filter(v=>v.action==="create").length,match:plan.filter(v=>v.action==="match").length,skip:plan.filter(v=>v.action==="skip").length},preview:plan.slice(0,25).map(v=>({row:v.outlet.row,name:v.outlet.name,websiteUrl:v.outlet.websiteUrl,location:v.outlet.countryName??v.outlet.publicationScopeRaw,sourceCategoryRaw:v.outlet.sourceCategoryRaw,contacts:v.outlet.contacts.length,action:v.action,reason:v.reason})),duplicates:plan.filter(v=>v.action!=="create").map(v=>({row:v.outlet.row,name:v.outlet.name,action:v.action,reason:v.reason})),issues:parsed.issues};
}
export async function importMedia(buffer:Buffer,fileName:string,mapping:Partial<MediaMapping>,actorId:string,updateMissing=false){
  const parsed=await parseMediaWorkbook(buffer,mapping),fileHash=createHash("sha256").update(buffer).digest("hex");
  const job=await prisma.mediaImportJob.create({data:{fileName:fileName.slice(0,240),fileHash,startedById:actorId}});
  try{
    await prisma.auditLog.create({data:{actorUserId:actorId,action:"MEDIA_IMPORT_STARTED",entityType:"MEDIA_IMPORT",entityId:job.id,description:"Started Media Sheet1 import"}});
    return await prisma.$transaction(async tx=>{
      // All imports share this transaction-scoped lock; concurrent uploads cannot duplicate records.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(843218)`;
      const previous=await tx.mediaImportJob.findMany({where:{fileHash,status:"COMPLETED"},select:{id:true,report:true},orderBy:{startedAt:"desc"}});
      const already=previous.find(v=>{const r=v.report as Record<string,unknown>|null;const mapping=r?.mapping as Record<string,unknown>|undefined;return mapping&&Object.entries(parsed.mapping).every(([key,column])=>mapping[key]===column);});
      const existing=await tx.mediaOutlet.findMany({where:{normalizedName:{in:parsed.outlets.map(v=>v.normalizedName)}},select:{id:true,name:true,normalizedName:true,websiteUrl:true,identityKey:true,countryCode:true,countryName:true,publicationScopeRaw:true,sourceCategoryRaw:true}});
      const plan=already?[]:planMediaImport(parsed.outlets,existing,fileHash);
      const newItems=plan.filter(v=>v.action==="create");
      await tx.mediaOutlet.createMany({data:newItems.map(({outlet:v,targetId:id})=>({id,name:v.name,normalizedName:v.normalizedName,identityKey:v.websiteUrl?v.identityKey:createHash("sha256").update(`${fileHash}:${v.row}`).digest("hex"),websiteUrl:v.websiteUrl,domain:v.domain,countryCode:v.countryCode,countryName:v.countryName,publicationScopeRaw:v.publicationScopeRaw,sourceCategoryRaw:v.sourceCategoryRaw,createdById:actorId}))});
      let updatedOutlets=0;
      if(updateMissing){
        const done=new Set<string>();
        for(const entry of plan.filter(v=>v.action==="match")){
          if(done.has(entry.targetId))continue;done.add(entry.targetId);
          const old=existing.find(v=>v.id===entry.targetId);if(!old)continue;
          const data={countryCode:old.countryCode?undefined:entry.outlet.countryCode??undefined,countryName:old.countryName?undefined:entry.outlet.countryName??undefined,publicationScopeRaw:old.publicationScopeRaw?undefined:entry.outlet.publicationScopeRaw??undefined,sourceCategoryRaw:old.sourceCategoryRaw?undefined:entry.outlet.sourceCategoryRaw??undefined};
          if(Object.values(data).some(v=>v!==undefined)){await tx.mediaOutlet.update({where:{id:entry.targetId},data});updatedOutlets++;}
        }
      }
      const accepted=plan.filter(v=>v.action!=="skip");
      const positions=await tx.mediaContact.groupBy({by:["mediaOutletId"],where:{mediaOutletId:{in:[...new Set(accepted.map(v=>v.targetId))]}},_max:{position:true}});
      const nextPosition=new Map(positions.map(v=>[v.mediaOutletId,(v._max.position??-1)+1]));
      const contacts=accepted.flatMap(({outlet,targetId})=>outlet.contacts.map(contact=>{const position=nextPosition.get(targetId)??0;nextPosition.set(targetId,position+1);return {...contact,position,mediaOutletId:targetId};}));
      let createdContacts=0;
      for(let index=0;index<contacts.length;index+=500)createdContacts+=(await tx.mediaContact.createMany({data:contacts.slice(index,index+500),skipDuplicates:true})).count;
      const sources=accepted.flatMap(({outlet,targetId})=>outlet.sources.map(source=>({mediaOutletId:targetId,importJobId:job.id,sourceSheet:"Sheet1",sourceRow:source.row,rawValues:source.raw,warnings:source.warnings})));
      for(let index=0;index<sources.length;index+=300)await tx.mediaImportSource.createMany({data:sources.slice(index,index+300),skipDuplicates:true});
      const result={jobId:job.id,fileHash,sheet:"Sheet1",ignoredSheets:parsed.ignoredSheets,mapping:parsed.mapping,...parsed.counts,createdOutlets:newItems.length,updatedOutlets,skippedOutlets:already?parsed.outlets.length:plan.filter(v=>v.action==="skip").length,matchedOutlets:plan.filter(v=>v.action==="match").length,createdContacts,updatedContacts:0,skippedContacts:already?parsed.counts.contacts:contacts.length-createdContacts,reimported:Boolean(already),previousJobId:already?.id??null,duplicates:plan.filter(v=>v.action!=="create").map(v=>({row:v.outlet.row,name:v.outlet.name,action:v.action,reason:v.reason})),issues:parsed.issues};
      const categoryReview=reviewMediaCategories(parsed.outlets,await tx.industryCategory.findMany({select:{id:true,name:true},take:1000}));
      await tx.mediaImportJob.update({where:{id:job.id},data:{status:"COMPLETED",completedAt:new Date(),report:{...result,categoryReview} as unknown as Prisma.InputJsonValue}});
      await tx.auditLog.create({data:{actorUserId:actorId,action:"MEDIA_IMPORT_COMPLETED",entityType:"MEDIA_IMPORT",entityId:job.id,description:"Completed atomic Media import",metadata:{createdOutlets:result.createdOutlets,createdContacts,skippedOutlets:result.skippedOutlets,warnings:result.warnings}}});
      return {...result,categoryReview};
    },{timeout:120000,maxWait:10000});
  }catch(error){
    await prisma.$transaction([prisma.mediaImportJob.update({where:{id:job.id},data:{status:"FAILED",completedAt:new Date(),report:{error:"Import failed; all publication/contact changes in this transaction were rolled back."}}}),prisma.auditLog.create({data:{actorUserId:actorId,action:"MEDIA_IMPORT_FAILED",entityType:"MEDIA_IMPORT",entityId:job.id,description:"Media import failed; data transaction rolled back"}})]);
    throw error;
  }
}
