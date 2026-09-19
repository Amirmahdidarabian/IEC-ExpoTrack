import { Permission } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/auth/errors";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { createUser, listUsers } from "@/lib/users/service";

export async function GET() {
  try { await requireAuthenticatedUser({ permission: Permission.MANAGE_USERS }); return NextResponse.json(await listUsers()); }
  catch (error) { return errorResponse(error); }
}

export async function POST(request: NextRequest) {
  try { const actor = await requireAuthenticatedUser({ permission: Permission.MANAGE_USERS }); return NextResponse.json(await createUser(actor, await request.json()), { status: 201 }); }
  catch (error) { return errorResponse(error, "Unable to create user."); }
}
