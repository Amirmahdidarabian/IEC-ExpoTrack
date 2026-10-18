import { saveMediaNote } from "@/lib/media/repository";
import { mediaJson, mediaRoute } from "@/lib/media/http";
export async function POST(request:Request,context:{params:Promise<{id:string}>}){return mediaRoute(request,"UPDATE_MEDIA",async actor=>saveMediaNote((await context.params).id,await mediaJson(request),actor.id),201);}
