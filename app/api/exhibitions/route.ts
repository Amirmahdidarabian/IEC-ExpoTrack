import { NextRequest, NextResponse } from "next/server";
import { createExhibition, DuplicateExhibitionError, findDuplicateExhibitions, listExhibitions, updateExhibition } from "@/lib/exhibitions/repository";
import type { ExhibitionInput } from "@/lib/exhibitions/types";
import { Permission } from "@prisma/client";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { errorResponse } from "@/lib/auth/errors";

export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  try {
    await requireAuthenticatedUser({ permission: Permission.VIEW_EXHIBITIONS });
    return NextResponse.json(await listExhibitions({
      q: p.get("q") ?? undefined, country: p.get("country") ?? undefined, industry: p.get("industry") ?? undefined,
      year: p.get("year") ?? undefined, topic: p.get("topic") ?? undefined, status: (p.get("status") ?? "all") as never,
      sort: (p.get("sort") ?? "nearest") as never, page: Number(p.get("page") ?? 1), pageSize: Number(p.get("pageSize") ?? 10),
    }));
  } catch (error) {
    return errorResponse(error, "Unable to load exhibitions");
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireAuthenticatedUser({ permission: Permission.CREATE_EXHIBITIONS });
    const payload = await request.json();
    const input = (payload.exhibition ?? payload) as ExhibitionInput;
    const resolution = payload.duplicateResolution as string | undefined;
    if (resolution === "replace" && payload.duplicateId) {
      await requireAuthenticatedUser({ permission: Permission.UPDATE_EXHIBITIONS });
      const matches = await findDuplicateExhibitions(input);
      if (!matches.some((item) => item.id === payload.duplicateId)) return NextResponse.json({ error: "Duplicate candidate is no longer available." }, { status: 409 });
      return NextResponse.json(await updateExhibition(payload.duplicateId, input, { skipDuplicateCheck: true, actorId: actor.id }));
    }
    return NextResponse.json(await createExhibition(input, { allowDuplicate: resolution === "keep-both", actorId: actor.id }), { status: 201 });
  } catch (error) {
    if (error instanceof DuplicateExhibitionError) return NextResponse.json({ code: error.code, error: error.message, duplicates: error.duplicates }, { status: 409 });
    return errorResponse(error, "Unable to add exhibition");
  }
}
