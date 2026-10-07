import { Permission } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/auth/errors";
import { requireSameOrigin } from "@/lib/auth/request-security";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { setVisitorMessagingStatus } from "@/lib/exhibitions/repository";

const schema = z.object({ available: z.boolean() });

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    requireSameOrigin(request);
    const actor = await requireAuthenticatedUser({ permission: Permission.UPDATE_EXHIBITIONS });
    const input = schema.parse(await request.json());
    return NextResponse.json(await setVisitorMessagingStatus((await context.params).id, input.available, actor.id));
  } catch (error) {
    return errorResponse(error, "Unable to update networking application status.");
  }
}
