import { NextRequest } from "next/server";
import { errorResponse } from "@/lib/auth/errors";
import { requireSameOrigin } from "@/lib/auth/request-security";
import { requireAdminUser } from "@/lib/auth/session";
import { createExport } from "@/lib/data-management/service";
import { consumeRateLimit, requestIdentifier } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    requireSameOrigin(request);
    const actor = await requireAdminUser();
    await consumeRateLimit("admin-data-export", requestIdentifier(request, actor.id), { limit: 20, windowMs: 15 * 60 * 1000 });
    const backup = await createExport(actor.id);
    const stamp = backup.exportedAt.slice(0, 16).replace("T", "-").replace(":", "");
    return new Response(JSON.stringify(backup, null, 2), { headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="iec-expotrack-backup-${stamp}.json"`,
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    } });
  } catch (error) { return errorResponse(error, "Unable to export data."); }
}
