import { NextResponse } from "next/server";
import { toggleSaved } from "@/lib/exhibitions/repository";
import { Permission } from "@prisma/client";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { errorResponse } from "@/lib/auth/errors";
import { requireSameOrigin } from "@/lib/auth/request-security";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    requireSameOrigin(request);
    await requireAuthenticatedUser({ permission: Permission.VIEW_EXHIBITIONS });
    return NextResponse.json({ saved: await toggleSaved((await context.params).id) });
  } catch (error) {
    return errorResponse(error, "Unable to update saved status");
  }
}
