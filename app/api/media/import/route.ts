import { HttpError } from "@/lib/auth/errors";
import { boundedBody, mediaRoute } from "@/lib/media/http";
import { importMedia, previewMediaImport } from "@/lib/media/import";
import { mappingSchema, MAX_MEDIA_IMPORT_BYTES } from "@/lib/media/import-parser";
export const runtime="nodejs";
export async function POST(request:Request){return mediaRoute(request,"IMPORT_MEDIA",async actor=>{
  const body=await boundedBody(request,MAX_MEDIA_IMPORT_BYTES+1024*1024);
  let form:FormData;try{form=await new Request(request.url,{method:"POST",headers:{"content-type":request.headers.get("content-type")??""},body:new Uint8Array(body)}).formData();}catch{throw new HttpError("Invalid workbook upload.",400);}
  const file=form.get("file");if(!(file instanceof File)||!file.name.toLowerCase().endsWith(".xlsx")||!file.size)throw new HttpError("Select an .xlsx workbook.",400);
  if(file.size>MAX_MEDIA_IMPORT_BYTES)throw new HttpError("Workbook exceeds 20 MB.",413);
  let value:unknown={};try{value=JSON.parse(String(form.get("mapping")??"{}"));}catch{throw new HttpError("Invalid column mapping.",400);}
  const mapping=mappingSchema.parse(value),buffer=Buffer.from(await file.arrayBuffer());
  if(form.get("mode")==="import")return importMedia(buffer,file.name,mapping,actor.id,form.get("updateMissing")==="true");
  return previewMediaImport(buffer,mapping);
});}
