import { saveMediaNote, deleteMediaNote } from "@/lib/media/repository";
import { mediaJson, mediaRoute } from "@/lib/media/http";
type Context={params:Promise<{id:string;noteId:string}>};
export async function PATCH(request:Request,context:Context){return mediaRoute(request,"UPDATE_MEDIA",async actor=>{const {id,noteId}=await context.params;return saveMediaNote(id,await mediaJson(request),actor.id,noteId);});}
export async function DELETE(request:Request,context:Context){return mediaRoute(request,"UPDATE_MEDIA",async actor=>{const {id,noteId}=await context.params;return deleteMediaNote(id,noteId,actor.id);});}
