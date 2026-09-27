import { Permission } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/auth/errors";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { resetUserPassword } from "@/lib/users/service";
import { requireSameOrigin } from "@/lib/auth/request-security";
import { consumeRateLimit, requestIdentifier } from "@/lib/security/rate-limit";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try { requireSameOrigin(request); const actor = await requireAuthenticatedUser({ permission: Permission.MANAGE_USERS }); await consumeRateLimit("admin-password-reset", requestIdentifier(request, actor.id), { limit: 10, windowMs: 60 * 60 * 1000 }); return NextResponse.json(await resetUserPassword(actor, (await context.params).id, await request.json())); }
  catch (error) { return errorResponse(error, "Unable to reset password."); }
}
