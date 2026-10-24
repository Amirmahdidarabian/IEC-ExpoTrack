import { Permission } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/auth/errors";
import { requireSameOrigin } from "@/lib/auth/request-security";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { assertImportFile, CompanyImportError, importCompanies, MAX_COMPANY_IMPORT_BYTES, previewCompanyImport, type ImportMapping } from "@/lib/companies/import";

export async function POST(request: NextRequest) {
  try {
    requireSameOrigin(request);
    const actor = await requireAuthenticatedUser({ permission: Permission.IMPORT_COMPANIES });
    if (Number(request.headers.get("content-length") || 0) > MAX_COMPANY_IMPORT_BYTES + 1_000_000) return NextResponse.json({ error: "Workbook upload is too large." }, { status: 413 });
    const form = await request.formData(); const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Select an .xlsx workbook." }, { status: 400 });
    assertImportFile(file);
    const rawMapping = form.get("mapping"); let mapping: Partial<ImportMapping> | undefined;
    try { mapping = typeof rawMapping === "string" && rawMapping ? JSON.parse(rawMapping) as Partial<ImportMapping> : undefined; }
    catch { throw new CompanyImportError("Column mapping is invalid."); }
    const folderId = z.string().min(1).max(100).optional().parse(form.get("folderId") || undefined);
    const buffer = Buffer.from(await file.arrayBuffer());
    if (form.get("mode") === "import") return NextResponse.json(await importCompanies(buffer, file.name, mapping ?? {}, actor.id, form.get("updateExisting") === "true", folderId));
    return NextResponse.json(await previewCompanyImport(buffer, mapping));
  } catch (error) {
    if (error instanceof CompanyImportError) return NextResponse.json({ error: error.message }, { status: 400 });
    return errorResponse(error, "Unable to process company workbook");
  }
}
