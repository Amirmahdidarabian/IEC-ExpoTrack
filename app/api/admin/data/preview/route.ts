import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/auth/errors";
import { requireSameOrigin } from "@/lib/auth/request-security";
import { requireAdminUser } from "@/lib/auth/session";
import { readBackupUpload } from "@/lib/data-management/request";
import { previewImport } from "@/lib/data-management/service";

export async function POST(request: NextRequest) {
  try {
    requireSameOrigin(request);
    await requireAdminUser();
    const { filename, backup } = await readBackupUpload(request);
    return NextResponse.json({ filename, ...(await previewImport(backup)) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return errorResponse(error, "Unable to validate backup."); }
}
