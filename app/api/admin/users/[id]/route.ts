import { Permission } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/auth/errors";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { updateUser } from "@/lib/users/service";

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try { const actor = await requireAuthenticatedUser({ permission: Permission.MANAGE_USERS }); return NextResponse.json(await updateUser(actor, (await context.params).id, await request.json())); }
  catch (error) { return errorResponse(error, "Unable to update user."); }
}
