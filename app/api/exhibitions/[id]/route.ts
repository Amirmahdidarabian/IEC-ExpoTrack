import { NextRequest, NextResponse } from "next/server";
import { deleteExhibition, getExhibition, updateExhibition } from "@/lib/exhibitions/repository";

export async function GET(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  const item = await getExhibition((await context.params).id);
  return item ? NextResponse.json(item) : NextResponse.json({ error: "Not found" }, { status: 404 });
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    return NextResponse.json(await updateExhibition((await context.params).id, await request.json()));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update exhibition" }, { status: 400 });
  }
}

export async function DELETE(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    await deleteExhibition((await context.params).id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to delete exhibition" }, { status: 400 });
  }
}
