import { NextRequest, NextResponse } from "next/server";
import { deleteTaxonomy, DuplicateTaxonomyError, renameTaxonomy, TaxonomyInUseError, type TaxonomyKind } from "@/lib/exhibitions/taxonomy";
import { Permission } from "@prisma/client";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { errorResponse } from "@/lib/auth/errors";
import { requireSameOrigin } from "@/lib/auth/request-security";

function parseKind(value: string): TaxonomyKind | null {
  return value === "categories" || value === "topics" ? value : null;
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ kind: string; id: string }> }) {
  try { requireSameOrigin(request); await requireAuthenticatedUser({ permission: Permission.UPDATE_EXHIBITIONS }); } catch (error) { return errorResponse(error); }
  const { kind: value, id } = await context.params;
  const kind = parseKind(value);
  if (!kind) return NextResponse.json({ error: "Unknown taxonomy." }, { status: 404 });
  try {
    const body = await request.json();
    return NextResponse.json(await renameTaxonomy(kind, id, String(body.name ?? "")));
  } catch (error) {
    if (error instanceof DuplicateTaxonomyError) return NextResponse.json({ code: error.code, error: error.message }, { status: 409 });
    return errorResponse(error, "Unable to rename item.");
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ kind: string; id: string }> }) {
  try { requireSameOrigin(request); await requireAuthenticatedUser({ permission: Permission.UPDATE_EXHIBITIONS }); } catch (error) { return errorResponse(error); }
  const { kind: value, id } = await context.params;
  const kind = parseKind(value);
  if (!kind) return NextResponse.json({ error: "Unknown taxonomy." }, { status: 404 });
  try {
    await deleteTaxonomy(kind, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof TaxonomyInUseError) return NextResponse.json({ code: error.code, usageCount: error.usageCount, error: error.message }, { status: 409 });
    return errorResponse(error, "Unable to delete item.");
  }
}
