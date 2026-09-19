import { NextRequest, NextResponse } from "next/server";
import { getCountryTimezones } from "@/lib/locations";
import { Permission } from "@prisma/client";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { errorResponse } from "@/lib/auth/errors";

export async function GET(request: NextRequest) {
  try { await requireAuthenticatedUser({ permission: Permission.VIEW_EXHIBITIONS }); } catch (error) { return errorResponse(error); }
  const country = request.nextUrl.searchParams.get("country") ?? "";
  if (!/^[A-Z]{2}$/.test(country)) return NextResponse.json({ error: "A valid country code is required." }, { status: 400 });
  try { return NextResponse.json(await getCountryTimezones(country)); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load timezones." }, { status: 500 }); }
}
