import { NextResponse } from "next/server";
import { toggleSaved } from "@/lib/exhibitions/repository";
import { Permission } from "@prisma/client";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { errorResponse } from "@/lib/auth/errors";

export async function POST(_: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireAuthenticatedUser({ permission: Permission.VIEW_EXHIBITIONS });
    return NextResponse.json({ saved: await toggleSaved((await context.params).id) });
  } catch (error) {
    return errorResponse(error, "Unable to update saved status");
  }
}
