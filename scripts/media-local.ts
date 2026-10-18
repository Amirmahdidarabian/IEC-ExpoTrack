/** Local-only inspection/import tool. Never use this against production. */
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { prisma } from "../lib/prisma";
import { previewMediaImport, importMedia } from "../lib/media/import";

function guard(){const url=new URL(process.env.DATABASE_URL??"");if(process.env.NODE_ENV==="production"||!["localhost","127.0.0.1","[::1]"].includes(url.hostname)||url.port!=="55432"||url.pathname!=="/iec_expobot")throw new Error("Refusing: this tool only supports local iec_expobot on localhost:55432. Production requires separate approval and procedure.");return {host:url.hostname,port:url.port,database:url.pathname.slice(1)};}
async function main(){const target=guard(),[command,file]=process.argv.slice(2);console.log(JSON.stringify({target}));
  if(command==="migrate"){execFileSync(process.execPath,[resolve("node_modules/prisma/build/index.js"),"migrate","deploy"],{stdio:"inherit",env:process.env});return;}
  if(command==="preview"||command==="import"){
    if(!file)throw new Error("Provide a private .xlsx file path.");const buffer=await readFile(file);
    if(command==="preview"){const result=await previewMediaImport(buffer);console.log(JSON.stringify({counts:result.counts,duplicates:result.duplicates,ignoredSheets:result.ignoredSheets},null,2));return;}
    const actor=await prisma.user.findFirst({where:{role:"ADMIN",isActive:true},orderBy:{createdAt:"asc"},select:{id:true}});if(!actor)throw new Error("No active local administrator exists. Create one through the existing authentication setup first.");
    const {issues,categoryReview,duplicates,...report}=await importMedia(buffer,basename(file),{},actor.id,false);console.log(JSON.stringify({...report,issueCount:issues.length,duplicateCandidates:duplicates.length,categoryReviewCount:categoryReview.length},null,2));return;
  }
  if(command!=="verify")throw new Error("Usage: node --env-file=.env --import tsx scripts/media-local.ts migrate|preview|import|verify [private-workbook-path]");
  const [outlets,contacts,sources,ignoredSheetSources,forms,pages,emails,primaryDuplicates,latest]=await Promise.all([prisma.mediaOutlet.count(),prisma.mediaContact.count(),prisma.mediaImportSource.count(),prisma.mediaImportSource.count({where:{sourceSheet:{not:"Sheet1"}}}),prisma.mediaContact.count({where:{contactMethod:"WEBSITE_FORM"}}),prisma.mediaContact.count({where:{contactMethod:"CONTACT_PAGE"}}),prisma.mediaContact.count({where:{email:{not:null}}}),prisma.$queryRaw<{count:bigint}[]>`SELECT COUNT(*) AS count FROM (SELECT "mediaOutletId" FROM "MediaContact" WHERE "isPrimary"=true GROUP BY "mediaOutletId" HAVING COUNT(*)>1) p`,prisma.mediaImportJob.findFirst({where:{status:"COMPLETED"},orderBy:{startedAt:"desc"},select:{id:true,report:true}})]);
  const report=latest?.report as Record<string,unknown>|null;console.log(JSON.stringify({outlets,contacts,sources,ignoredSheetSources,forms,pages,emails,duplicatePrimaryGroups:Number(primaryDuplicates[0]?.count??0),latestJobId:latest?.id,latestReport:report?{createdOutlets:report.createdOutlets,createdContacts:report.createdContacts,reimported:report.reimported}:null},null,2));
}
main().catch(error=>{console.error(error instanceof Error?error.message:"Local Media operation failed.");process.exitCode=1;}).finally(()=>prisma.$disconnect());
