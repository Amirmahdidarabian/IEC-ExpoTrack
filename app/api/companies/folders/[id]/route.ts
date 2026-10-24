import { Permission } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/auth/errors";
import { requireSameOrigin } from "@/lib/auth/request-security";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { deleteCompanyFolder, saveCompanyFolder } from "@/lib/companies/folders";
type Context = { params: Promise<{ id: string }> };
export async function PATCH(request: NextRequest, context: Context) {
  try { requireSameOrigin(request); const actor = await requireAuthenticatedUser({ permission: Permission.UPDATE_COMPANIES }); return NextResponse.json(await saveCompanyFolder(await request.json(), actor.id, (await context.params).id)); }
  catch (error) { return errorResponse(error, "Unable to update company folder"); }
}
export async function DELETE(request: NextRequest, context: Context) {
  try { requireSameOrigin(request); const actor = await requireAuthenticatedUser({ permission: Permission.UPDATE_COMPANIES }); await deleteCompanyFolder((await context.params).id, actor.id); return NextResponse.json({ ok: true }); }
  catch (error) { return errorResponse(error, "Unable to delete company folder"); }
}
