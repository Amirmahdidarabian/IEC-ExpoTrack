import { getMedia, updateMedia, deleteMedia } from "@/lib/media/repository";
import { mediaJson, mediaRoute } from "@/lib/media/http";
type Context={params:Promise<{id:string}>};
export async function GET(request:Request,context:Context){return mediaRoute(request,"VIEW_MEDIA",async()=>getMedia((await context.params).id));}
export async function PATCH(request:Request,context:Context){return mediaRoute(request,"UPDATE_MEDIA",async actor=>updateMedia((await context.params).id,await mediaJson(request),actor.id));}
export async function DELETE(request:Request,context:Context){return mediaRoute(request,"DELETE_MEDIA",async actor=>deleteMedia((await context.params).id,actor.id));}
