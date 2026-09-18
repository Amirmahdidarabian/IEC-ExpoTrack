import { NextResponse } from "next/server";
import { toggleSaved } from "@/lib/exhibitions/repository";

export async function POST(_: Request, context: { params: Promise<{ id: string }> }) {
  try {
    return NextResponse.json({ saved: await toggleSaved((await context.params).id) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update saved status" }, { status: 400 });
  }
}
