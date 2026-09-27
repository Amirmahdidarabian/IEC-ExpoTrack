import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/auth/errors";
import { requireSameOrigin } from "@/lib/auth/request-security";
import { requireAdminUser } from "@/lib/auth/session";
import { readBackupUpload } from "@/lib/data-management/request";
import { importBackup } from "@/lib/data-management/service";
import { consumeRateLimit, requestIdentifier } from "@/lib/security/rate-limit";

export async function POST(request: NextRequest) {
  try {
    requireSameOrigin(request);
    const actor = await requireAdminUser();
    await consumeRateLimit("admin-data-import", requestIdentifier(request, actor.id), { limit: 5, windowMs: 15 * 60 * 1000 });
    const { filename, backup } = await readBackupUpload(request);
    const result = await importBackup(backup, actor.id, filename);
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return errorResponse(error, "Import failed. No data was changed."); }
}
