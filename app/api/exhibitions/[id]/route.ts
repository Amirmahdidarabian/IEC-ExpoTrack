import { NextRequest, NextResponse } from "next/server";
import { deleteExhibition, DuplicateExhibitionError, getExhibition, updateExhibition } from "@/lib/exhibitions/repository";
import { Permission } from "@prisma/client";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { errorResponse } from "@/lib/auth/errors";

export async function GET(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  try { await requireAuthenticatedUser({ permission: Permission.VIEW_EXHIBITIONS }); } catch (error) { return errorResponse(error); }
  const item = await getExhibition((await context.params).id);
  return item ? NextResponse.json(item) : NextResponse.json({ error: "Not found" }, { status: 404 });
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireAuthenticatedUser({ permission: Permission.UPDATE_EXHIBITIONS });
    return NextResponse.json(await updateExhibition((await context.params).id, await request.json(), { actorId: actor.id }));
  } catch (error) {
    if (error instanceof DuplicateExhibitionError) return NextResponse.json({ code: error.code, error: error.message, duplicates: error.duplicates }, { status: 409 });
    return errorResponse(error, "Unable to update exhibition");
  }
}

export async function DELETE(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireAuthenticatedUser({ permission: Permission.DELETE_EXHIBITIONS });
    await deleteExhibition((await context.params).id, actor.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error, "Unable to delete exhibition");
  }
}
