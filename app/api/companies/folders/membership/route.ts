import { Permission } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/auth/errors";
import { requireSameOrigin } from "@/lib/auth/request-security";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { changeFolderMembership } from "@/lib/companies/folders";
export async function POST(request: NextRequest) {
  try { requireSameOrigin(request); const actor = await requireAuthenticatedUser({ permission: Permission.UPDATE_COMPANIES }); return NextResponse.json(await changeFolderMembership(await request.json(), actor.id)); }
  catch (error) { return errorResponse(error, "Unable to change company folders"); }
}
