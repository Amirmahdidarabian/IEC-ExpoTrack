import { NextRequest, NextResponse } from "next/server";
import { deleteTaxonomy, DuplicateTaxonomyError, renameTaxonomy, TaxonomyInUseError, type TaxonomyKind } from "@/lib/exhibitions/taxonomy";

function parseKind(value: string): TaxonomyKind | null {
  return value === "categories" || value === "topics" ? value : null;
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ kind: string; id: string }> }) {
  const { kind: value, id } = await context.params;
  const kind = parseKind(value);
  if (!kind) return NextResponse.json({ error: "Unknown taxonomy." }, { status: 404 });
  try {
    const body = await request.json();
    return NextResponse.json(await renameTaxonomy(kind, id, String(body.name ?? "")));
  } catch (error) {
    const status = error instanceof DuplicateTaxonomyError ? 409 : 400;
    return NextResponse.json({ code: error instanceof DuplicateTaxonomyError ? error.code : undefined, error: error instanceof Error ? error.message : "Unable to rename item." }, { status });
  }
}

export async function DELETE(_: NextRequest, context: { params: Promise<{ kind: string; id: string }> }) {
  const { kind: value, id } = await context.params;
  const kind = parseKind(value);
  if (!kind) return NextResponse.json({ error: "Unknown taxonomy." }, { status: 404 });
  try {
    await deleteTaxonomy(kind, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const status = error instanceof TaxonomyInUseError ? 409 : 400;
    return NextResponse.json({ code: error instanceof TaxonomyInUseError ? error.code : undefined, usageCount: error instanceof TaxonomyInUseError ? error.usageCount : undefined, error: error instanceof Error ? error.message : "Unable to delete item." }, { status });
  }
}
