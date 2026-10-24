import { Permission } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/auth/errors";
import { requireSameOrigin } from "@/lib/auth/request-security";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { listCompanyFolders, saveCompanyFolder } from "@/lib/companies/folders";

export async function GET() {
  try { await requireAuthenticatedUser({ permission: Permission.VIEW_COMPANIES }); return NextResponse.json(await listCompanyFolders()); }
  catch (error) { return errorResponse(error, "Unable to load company folders"); }
}
export async function POST(request: NextRequest) {
  try { requireSameOrigin(request); const actor = await requireAuthenticatedUser({ permission: Permission.UPDATE_COMPANIES }); return NextResponse.json(await saveCompanyFolder(await request.json(), actor.id), { status: 201 }); }
  catch (error) { return errorResponse(error, "Unable to create company folder"); }
}
