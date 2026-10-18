import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/auth/errors";
import { mediaRoute } from "@/lib/media/http";
export async function GET(request:Request,context:{params:Promise<{jobId:string}>}){return mediaRoute(request,"IMPORT_MEDIA",async()=>{const job=await prisma.mediaImportJob.findUnique({where:{id:(await context.params).jobId},select:{id:true,fileName:true,fileHash:true,status:true,startedAt:true,completedAt:true,report:true}});if(!job)throw new HttpError("Import report not found.",404);return job;});}
