import { classifyMedia } from "@/lib/media/repository";
import { mediaJson, mediaRoute } from "@/lib/media/http";
export async function PATCH(request:Request,context:{params:Promise<{id:string}>}){return mediaRoute(request,"UPDATE_MEDIA",async actor=>classifyMedia((await context.params).id,await mediaJson(request),actor.id));}
