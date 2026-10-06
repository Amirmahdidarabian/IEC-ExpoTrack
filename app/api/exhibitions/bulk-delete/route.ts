import { Permission } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/auth/errors";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { requireSameOrigin } from "@/lib/auth/request-security";
import { deleteExhibitions } from "@/lib/exhibitions/repository";

const requestSchema = z.object({ ids: z.array(z.string().min(1)).min(1).max(200) });

export async function DELETE(request: NextRequest) {
  try {
    requireSameOrigin(request);
    const actor = await requireAuthenticatedUser({ permission: Permission.DELETE_EXHIBITIONS });
    const { ids } = requestSchema.parse(await request.json());
    const deleted = await deleteExhibitions(ids, actor.id);
    return NextResponse.json({ ok: true, deleted });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2003") return NextResponse.json({ error: "Unlink the selected exhibitions from all companies before deleting them." }, { status: 409 });
    return errorResponse(error, "Unable to delete exhibitions");
  }
}
