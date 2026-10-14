import { NextResponse } from "next/server";
import { listSavedExhibitions } from "@/lib/exhibitions/repository";
import { Permission } from "@prisma/client";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { errorResponse } from "@/lib/auth/errors";

export async function GET() {
  try { await requireAuthenticatedUser({ permission: Permission.VIEW_EXHIBITIONS }); return NextResponse.json(await listSavedExhibitions(), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return errorResponse(error); }
}
