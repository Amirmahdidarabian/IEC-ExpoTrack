import { NextRequest, NextResponse } from "next/server";
import { createExhibition, DuplicateExhibitionError, findDuplicateExhibitions, listExhibitions, updateExhibition } from "@/lib/exhibitions/repository";
import type { ExhibitionInput } from "@/lib/exhibitions/types";

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
    const payload = await request.json();
    const input = (payload.exhibition ?? payload) as ExhibitionInput;
    const resolution = payload.duplicateResolution as string | undefined;
    if (resolution === "replace" && payload.duplicateId) {
      const matches = await findDuplicateExhibitions(input);
      if (!matches.some((item) => item.id === payload.duplicateId)) return NextResponse.json({ error: "Duplicate candidate is no longer available." }, { status: 409 });
      return NextResponse.json(await updateExhibition(payload.duplicateId, input, { skipDuplicateCheck: true }));
    }
    return NextResponse.json(await createExhibition(input, { allowDuplicate: resolution === "keep-both" }), { status: 201 });
  } catch (error) {
    if (error instanceof DuplicateExhibitionError) return NextResponse.json({ code: error.code, error: error.message, duplicates: error.duplicates }, { status: 409 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to add exhibition" }, { status: 400 });
  }
}
