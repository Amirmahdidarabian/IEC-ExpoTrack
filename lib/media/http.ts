import { NextResponse } from "next/server";
import type { Permission } from "@prisma/client";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { requireSameOrigin } from "@/lib/auth/request-security";
import { errorResponse, HttpError } from "@/lib/auth/errors";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import type { AuthorizedUser } from "@/lib/auth/permissions";
import { DuplicateMediaError } from "./repository";
import { MediaImportError } from "./import-parser";

export async function mediaRoute(request:Request,permission:Permission,action:(actor:AuthorizedUser)=>Promise<unknown>,status=200){
  try{
    if(request.method!=="GET")requireSameOrigin(request);
    const actor=await requireAuthenticatedUser({permission});
    if(request.method!=="GET")await consumeRateLimit(permission==="IMPORT_MEDIA"?"media-import":"media-write",actor.id,{limit:permission==="IMPORT_MEDIA"?20:180,windowMs:60000});
    return NextResponse.json((await action(actor))??{ok:true},{status,headers:{"Cache-Control":"no-store"}});
  }catch(error){
    if(error instanceof DuplicateMediaError)return NextResponse.json({error:error.message,duplicates:error.duplicates},{status:409});
    if(error instanceof MediaImportError)return NextResponse.json({error:error.message},{status:400});
    return errorResponse(error,"Unable to process media request");
  }
}
export async function boundedBody(request:Request,limit=256*1024){
  const length=Number(request.headers.get("content-length")??0);if(length>limit)throw new HttpError("Request body is too large.",413);
  const reader=request.body?.getReader();const chunks:Uint8Array[]=[];let size=0;
  if(reader)try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();throw new HttpError("Request body is too large.",413);}chunks.push(value);}}finally{reader.releaseLock();}
  return Buffer.concat(chunks);
}
export async function mediaJson(request:Request):Promise<unknown>{try{return JSON.parse((await boundedBody(request)).toString("utf8"));}catch(error){if(error instanceof HttpError)throw error;throw new HttpError("Invalid JSON body.",400);}}
