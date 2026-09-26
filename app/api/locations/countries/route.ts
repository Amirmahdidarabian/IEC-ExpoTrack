import { NextRequest, NextResponse } from "next/server";
import { searchCountries } from "@/lib/locations";
import { Permission } from "@prisma/client";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { errorResponse } from "@/lib/auth/errors";

export async function GET(request: NextRequest) {
  try { await requireAuthenticatedUser({ permission: Permission.VIEW_EXHIBITIONS }); } catch (error) { return errorResponse(error); }
  try { return NextResponse.json(await searchCountries(request.nextUrl.searchParams.get("q") ?? "")); }
  catch (error) { return errorResponse(error, "Unable to load countries."); }
}
