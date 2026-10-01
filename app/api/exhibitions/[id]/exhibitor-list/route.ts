import { Permission } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/auth/errors";
import { requireSameOrigin } from "@/lib/auth/request-security";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { setExhibitorListStatus } from "@/lib/exhibitions/repository";

const schema = z.object({ available: z.boolean() });

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    requireSameOrigin(request);
    const actor = await requireAuthenticatedUser({ permission: Permission.UPDATE_EXHIBITIONS });
    const input = schema.parse(await request.json());
    return NextResponse.json(await setExhibitorListStatus((await context.params).id, input.available, actor.id));
  } catch (error) { return errorResponse(error, "Unable to update exhibitor list status."); }
}
