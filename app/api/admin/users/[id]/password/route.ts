import { Permission } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/auth/errors";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { resetUserPassword } from "@/lib/users/service";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try { const actor = await requireAuthenticatedUser({ permission: Permission.MANAGE_USERS }); return NextResponse.json(await resetUserPassword(actor, (await context.params).id, await request.json())); }
  catch (error) { return errorResponse(error, "Unable to reset password."); }
}
