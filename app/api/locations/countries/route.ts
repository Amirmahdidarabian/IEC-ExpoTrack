import { NextRequest, NextResponse } from "next/server";
import { searchCountries } from "@/lib/locations";

export async function GET(request: NextRequest) {
  try { return NextResponse.json(await searchCountries(request.nextUrl.searchParams.get("q") ?? "")); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load countries." }, { status: 500 }); }
}
