import { Permission } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/auth/errors";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { updateUser } from "@/lib/users/service";
import { requireSameOrigin } from "@/lib/auth/request-security";
import { consumeRateLimit, requestIdentifier } from "@/lib/security/rate-limit";

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try { requireSameOrigin(request); const actor = await requireAuthenticatedUser({ permission: Permission.MANAGE_USERS }); await consumeRateLimit("admin-user-update", requestIdentifier(request, actor.id), { limit: 30, windowMs: 15 * 60 * 1000 }); return NextResponse.json(await updateUser(actor, (await context.params).id, await request.json())); }
  catch (error) { return errorResponse(error, "Unable to update user."); }
}
