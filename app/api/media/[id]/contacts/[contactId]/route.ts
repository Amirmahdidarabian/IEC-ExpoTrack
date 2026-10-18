import { saveMediaContact, deleteMediaContact } from "@/lib/media/repository";
import { mediaJson, mediaRoute } from "@/lib/media/http";
type Context={params:Promise<{id:string;contactId:string}>};
export async function PATCH(request:Request,context:Context){return mediaRoute(request,"UPDATE_MEDIA",async actor=>{const {id,contactId}=await context.params;return saveMediaContact(id,await mediaJson(request),actor.id,contactId);});}
export async function DELETE(request:Request,context:Context){return mediaRoute(request,"UPDATE_MEDIA",async actor=>{const {id,contactId}=await context.params;return deleteMediaContact(id,contactId,actor.id);});}
