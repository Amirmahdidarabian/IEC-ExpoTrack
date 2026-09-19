import { NextResponse } from "next/server";
import { listExhibitions } from "@/lib/exhibitions/repository";
import { Permission } from "@prisma/client";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { errorResponse } from "@/lib/auth/errors";

export async function GET() {
  try { await requireAuthenticatedUser({ permission: Permission.VIEW_EXHIBITIONS }); const result = await listExhibitions({ pageSize: 50, sort: "recent" }); return NextResponse.json(result.items.filter((item) => item.saved)); }
  catch (error) { return errorResponse(error); }
}
