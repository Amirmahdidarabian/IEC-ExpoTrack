import { NextRequest, NextResponse } from "next/server";
import { createExhibition, listExhibitions } from "@/lib/exhibitions/repository";

export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  try {
    return NextResponse.json(await listExhibitions({
      q: p.get("q") ?? undefined, country: p.get("country") ?? undefined, industry: p.get("industry") ?? undefined,
      year: p.get("year") ?? undefined, topic: p.get("topic") ?? undefined, status: (p.get("status") ?? "all") as never,
      sort: (p.get("sort") ?? "nearest") as never, page: Number(p.get("page") ?? 1), pageSize: Number(p.get("pageSize") ?? 10),
    }));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load exhibitions" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    return NextResponse.json(await createExhibition(await request.json()), { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to add exhibition" }, { status: 400 });
  }
}
