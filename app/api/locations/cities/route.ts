import { NextRequest, NextResponse } from "next/server";
import { searchCities } from "@/lib/locations";

export async function GET(request: NextRequest) {
  const country = request.nextUrl.searchParams.get("country") ?? "";
  if (!/^[A-Z]{2}$/.test(country)) return NextResponse.json({ error: "A valid country code is required." }, { status: 400 });
  try { return NextResponse.json(await searchCities(country, request.nextUrl.searchParams.get("q") ?? "")); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load cities." }, { status: 500 }); }
}
