import { NextRequest, NextResponse } from "next/server";
import { createTaxonomy, DuplicateTaxonomyError, listTaxonomies, type TaxonomyKind } from "@/lib/exhibitions/taxonomy";
import { Permission } from "@prisma/client";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { errorResponse } from "@/lib/auth/errors";
import { requireSameOrigin } from "@/lib/auth/request-security";

function parseKind(value: string): TaxonomyKind | null {
  return value === "categories" || value === "topics" ? value : null;
}

export async function GET(_: NextRequest, context: { params: Promise<{ kind: string }> }) {
  try { await requireAuthenticatedUser({ permission: Permission.VIEW_EXHIBITIONS }); } catch (error) { return errorResponse(error); }
  const kind = parseKind((await context.params).kind);
  if (!kind) return NextResponse.json({ error: "Unknown taxonomy." }, { status: 404 });
  try { return NextResponse.json(await listTaxonomies(kind)); }
  catch (error) { return errorResponse(error, "Unable to load items."); }
}

export async function POST(request: NextRequest, context: { params: Promise<{ kind: string }> }) {
  try { requireSameOrigin(request); await requireAuthenticatedUser({ permission: Permission.UPDATE_EXHIBITIONS }); } catch (error) { return errorResponse(error); }
  const kind = parseKind((await context.params).kind);
  if (!kind) return NextResponse.json({ error: "Unknown taxonomy." }, { status: 404 });
  try {
    const body = await request.json();
    return NextResponse.json(await createTaxonomy(kind, String(body.name ?? "")), { status: 201 });
  } catch (error) {
    if (error instanceof DuplicateTaxonomyError) return NextResponse.json({ code: error.code, error: error.message }, { status: 409 });
    return errorResponse(error, "Unable to add item.");
  }
}
