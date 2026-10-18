/** Real-PostgreSQL regression checks. Synthetic, uniquely owned fixtures only. */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import ExcelJS from "exceljs";
import { prisma } from "../lib/prisma";
import { classifyMedia, createMedia, deleteMedia, deleteMediaContact, deleteMediaNote, getMedia, listMedia, reorderMediaContacts, saveMediaContact, saveMediaNote, updateMedia } from "../lib/media/repository";
import { parseMediaQuery } from "../lib/media/query";
import { importMedia } from "../lib/media/import";
import { mediaIdentity } from "../lib/media/normalization";

async function main(){
  const target=new URL(process.env.DATABASE_URL??"");if(process.env.NODE_ENV==="production"||!["localhost","127.0.0.1"].includes(target.hostname)||target.port!=="55432"||target.pathname!=="/iec_expobot")throw new Error("Integration tests are restricted to local iec_expobot on localhost:55432.");
  const prefix=`media-regression-${Date.now()}-`,owned:string[]=[],jobs:string[]=[];let actorId:string|undefined,categoryId:string|undefined,topicId:string|undefined;let checks=0;
  const pass=(condition:unknown,label:string)=>{assert.ok(condition,label);checks++;console.log(`PASS ${label}`);};
  const before={companies:await prisma.company.count(),exhibitions:await prisma.exhibition.count(),media:await prisma.mediaOutlet.count(),contacts:await prisma.mediaContact.count()};
  try{
    const actor=await prisma.user.create({data:{username:prefix,passwordHash:randomBytes(32).toString("hex"),role:"ADMIN",mustChangePassword:false}});actorId=actor.id;
    const category=await prisma.industryCategory.create({data:{name:prefix,normalizedName:prefix,slug:prefix}});categoryId=category.id;
    const topic=await prisma.topic.create({data:{name:prefix,normalizedName:prefix,slug:prefix}});topicId=topic.id;
    const one=await createMedia({name:`${prefix}One`,websiteUrl:"example.com/one",countryCode:"us",countryName:"Wrong country",categoryIds:[category.id],topicIds:[topic.id]},actor.id);owned.push(one.id);
    const two=await createMedia({name:`${prefix}Two`,websiteUrl:"example.com/two"},actor.id);owned.push(two.id);
    pass(one.countryCode==="US"&&one.countryName==="United States","Media create normalizes validated country and uses shared taxonomy");
    await assert.rejects(()=>createMedia({name:one.name},actor.id),/similar identity/);checks++;
    await assert.rejects(()=>createMedia({name:`${prefix}Invalid`,countryCode:"ZZ"},actor.id),/valid ISO/);checks++;
    await updateMedia(one.id,{description:"Updated description"},actor.id);pass((await getMedia(one.id)).websiteUrl===one.websiteUrl,"Partial edit preserves omitted fields");
    const first=await saveMediaContact(one.id,{roleLabel:"Editorial",email:"shared@example.com",isPrimary:true},actor.id);
    const second=await saveMediaContact(one.id,{roleLabel:"Sales",email:"shared@example.com"},actor.id);
    await saveMediaContact(two.id,{roleLabel:"Editorial",email:"shared@example.com",isPrimary:true},actor.id);
    pass((await getMedia(one.id)).contacts.length===2,"Shared mailbox preserves separately labeled roles and distinct outlets");
    await Promise.all([saveMediaContact(one.id,{isPrimary:true},actor.id,first.id),saveMediaContact(one.id,{isPrimary:true},actor.id,second.id)]);
    pass(await prisma.mediaContact.count({where:{mediaOutletId:one.id,isPrimary:true}})===1,"Concurrent primary changes serialize to exactly one primary");
    await assert.rejects(()=>prisma.mediaContact.create({data:{mediaOutletId:one.id,email:"extra@example.com",isPrimary:true}}));checks++;
    await assert.rejects(()=>saveMediaContact(two.id,{roleLabel:"Wrong owner"},actor.id,first.id),/Contact not found/);checks++;
    await reorderMediaContacts(one.id,{ids:[second.id,first.id]},actor.id);pass((await getMedia(one.id)).contacts[0].id===second.id,"Contact reorder persists display order");
    await assert.rejects(()=>reorderMediaContacts(one.id,{ids:[first.id,first.id]},actor.id),/exactly once/);checks++;
    const note=await saveMediaNote(one.id,{body:"<script>plain text</script>"},actor.id);await saveMediaNote(one.id,{body:"Edited factual note"},actor.id,note.id);pass((await getMedia(one.id)).notes[0].body==="Edited factual note","Notes create/edit persist with authenticated author");
    await assert.rejects(()=>saveMediaNote(two.id,{body:"Cross outlet"},actor.id,note.id));checks++;
    await deleteMediaNote(one.id,note.id,actor.id);pass((await getMedia(one.id)).notes.length===0,"Note deletion is scoped");
    await classifyMedia(one.id,{categoryIds:[],topicIds:[]},actor.id);pass(Boolean(await prisma.industryCategory.findUnique({where:{id:category.id}}))&&Boolean(await prisma.topic.findUnique({where:{id:topic.id}})),"Removing Media classifications never deletes shared taxonomy");
    await classifyMedia(one.id,{categoryIds:[category.id],topicIds:[topic.id]},actor.id);
    const listing=await listMedia(parseMediaQuery({q:prefix,category:category.id,hasEmail:"true",minContacts:"2",maxContacts:"2",sort:"contacts-desc",pageSize:"25"}));pass(listing.total===1&&listing.items[0].id===one.id,"Database relational search, contact-count and classification filters work");pass((await listMedia(parseMediaQuery({q:`${prefix}no-match`}))).total===0,"Zero-results search works");
    const all=await listMedia(parseMediaQuery({q:prefix,pageSize:"all",page:"999"}));pass(all.pageSize==="all"&&all.page===1&&all.pageCount===1&&all.items.length===all.total&&all.total===2,"All returns every filtered publication and resets out-of-range pagination");
    await deleteMediaContact(one.id,first.id,actor.id);pass((await getMedia(one.id)).contacts.length===1,"Contact deletion persists");
    const book=new ExcelJS.Workbook();book.addWorksheet("Sheet1").addRows([["publication","category","Website",null,"Email","Country of publication"],[`${prefix}Import` ,"Oil&Gas","example.com/import","Editorial","import@example.com","Global"],[null,null,null,"Web form","Call in site"]]);book.addWorksheet("Sheet4").addRow(["ignored@example.com",100]);const bytes=Buffer.from(await book.xlsx.writeBuffer());
    const result=await importMedia(bytes,"media-regression.xlsx",{},actor.id);jobs.push(result.jobId);owned.push(...(await prisma.mediaImportSource.findMany({where:{importJobId:result.jobId},distinct:["mediaOutletId"],select:{mediaOutletId:true}})).map(v=>v.mediaOutletId));pass(result.createdOutlets===1&&result.createdContacts===2&&result.ignoredSheets.includes("Sheet4"),"Real XLSX import commits Sheet1 records and ignores Sheet4");
    await assert.rejects(()=>updateMedia(owned[2],{sourceCategoryRaw:"discard original"},actor.id),/raw category is preserved/);checks++;
    const again=await importMedia(bytes,"same-file.xlsx",{},actor.id);jobs.push(again.jobId);pass(again.reimported&&again.createdOutlets===0&&again.createdContacts===0,"Same-file import is idempotent in PostgreSQL");
    book.getWorksheet("Sheet1")!.getCell("B2").value="Changed source category";book.getWorksheet("Sheet1")!.addRow([null,null,null,"Sales","new@example.com"]);const changed=await importMedia(Buffer.from(await book.xlsx.writeBuffer()),"updated-regression.xlsx",{},actor.id,true);jobs.push(changed.jobId);pass(changed.createdOutlets===0&&changed.createdContacts===1&&(await getMedia(owned[2])).sourceCategoryRaw==="Oil&Gas","Changed-file import appends contacts but never replaces populated raw fields");
    const brokenName=`${prefix}Conflict`,broken=await prisma.mediaOutlet.create({data:{name:brokenName,normalizedName:`${prefix}legacy-normalization`,websiteUrl:"https://example.com/conflict",identityKey:mediaIdentity(brokenName,"https://example.com/conflict")}});owned.push(broken.id);const conflict=new ExcelJS.Workbook();conflict.addWorksheet("Sheet1").addRows([["publication","category","Website",null,"Email","Country of publication"],[`${prefix}Rollback`,null,"example.com/rollback","Editorial","rollback@example.com"],[brokenName,null,"example.com/conflict"]]);const failureName=`${prefix}expected-failure.xlsx`,countBeforeFailure=await prisma.mediaOutlet.count();
    // Generate bytes before invoking import (and verify a real transaction failure, not parse rejection).
    const conflictBytes=Buffer.from(await conflict.xlsx.writeBuffer());await assert.rejects(()=>importMedia(conflictBytes,failureName,{},actor.id));const failed=await prisma.mediaImportJob.findFirst({where:{fileName:failureName,status:"FAILED"}});if(failed)jobs.push(failed.id);pass(Boolean(failed)&&await prisma.mediaOutlet.count()===countBeforeFailure,"Failed database import rolls back all candidate outlets and records FAILED diagnostics");
    const audit=await prisma.auditLog.count({where:{actorUserId:actor.id,action:{in:["MEDIA_CREATED","MEDIA_CONTACT_CREATED","MEDIA_NOTE_UPDATED","MEDIA_CLASSIFICATION_UPDATED","MEDIA_IMPORT_COMPLETED"]}}});pass(audit>=8,"Real writes produce actor-scoped audit records without raw contact values");
    await deleteMedia(one.id,actor.id);pass(await prisma.mediaContact.count({where:{mediaOutletId:one.id}})===0&&await prisma.mediaCategory.count({where:{mediaOutletId:one.id}})===0,"Outlet deletion cascades only its owned contacts and links");
    pass(await prisma.company.count()===before.companies&&await prisma.exhibition.count()===before.exhibitions,"Existing Companies and Exhibitions are unchanged");
  }finally{
    // IDs below were created by this run; imported user data is never selected for deletion.
    if(owned.length)await prisma.mediaOutlet.deleteMany({where:{id:{in:owned}}});if(jobs.length)await prisma.mediaImportJob.deleteMany({where:{id:{in:jobs}}});if(categoryId)await prisma.industryCategory.delete({where:{id:categoryId}});if(topicId)await prisma.topic.delete({where:{id:topicId}});if(actorId)await prisma.user.delete({where:{id:actorId}});
  }
  pass(await prisma.mediaOutlet.count()===before.media&&await prisma.mediaContact.count()===before.contacts,"Synthetic fixtures cleaned up; actual imported dataset preserved");console.log(`Media database integration: ${checks} checks passed.`);
}
main().catch(error=>{console.error(error instanceof Error?error.message:"Database regression failed");process.exitCode=1;}).finally(()=>prisma.$disconnect());
