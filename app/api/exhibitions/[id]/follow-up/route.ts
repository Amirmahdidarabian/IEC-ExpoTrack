import { Permission } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/auth/errors";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { setEmailFollowUpStatus } from "@/lib/exhibitions/repository";

const schema = z.object({ kind: z.enum(["pre", "post"]), sent: z.boolean() });

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireAuthenticatedUser({ permission: Permission.UPDATE_EXHIBITIONS });
    const input = schema.parse(await request.json());
    return NextResponse.json(await setEmailFollowUpStatus((await context.params).id, input.kind, input.sent, actor.id));
  } catch (error) { return errorResponse(error, "Unable to update email status."); }
}
