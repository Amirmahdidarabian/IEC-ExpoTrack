import { NextRequest, NextResponse } from "next/server";
import { createTaxonomy, DuplicateTaxonomyError, listTaxonomies, type TaxonomyKind } from "@/lib/exhibitions/taxonomy";
import { Permission } from "@prisma/client";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { errorResponse } from "@/lib/auth/errors";

function parseKind(value: string): TaxonomyKind | null {
  return value === "categories" || value === "topics" ? value : null;
}

export async function GET(_: NextRequest, context: { params: Promise<{ kind: string }> }) {
  try { await requireAuthenticatedUser({ permission: Permission.VIEW_EXHIBITIONS }); } catch (error) { return errorResponse(error); }
  const kind = parseKind((await context.params).kind);
  if (!kind) return NextResponse.json({ error: "Unknown taxonomy." }, { status: 404 });
  try { return NextResponse.json(await listTaxonomies(kind)); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load items." }, { status: 500 }); }
}

export async function POST(request: NextRequest, context: { params: Promise<{ kind: string }> }) {
  try { await requireAuthenticatedUser({ permission: Permission.UPDATE_EXHIBITIONS }); } catch (error) { return errorResponse(error); }
  const kind = parseKind((await context.params).kind);
  if (!kind) return NextResponse.json({ error: "Unknown taxonomy." }, { status: 404 });
  try {
    const body = await request.json();
    return NextResponse.json(await createTaxonomy(kind, String(body.name ?? "")), { status: 201 });
  } catch (error) {
    const status = error instanceof DuplicateTaxonomyError ? 409 : 400;
    return NextResponse.json({ code: error instanceof DuplicateTaxonomyError ? error.code : undefined, error: error instanceof Error ? error.message : "Unable to add item." }, { status });
  }
}
