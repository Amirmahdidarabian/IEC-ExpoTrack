import { Permission } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/auth/errors";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { requireSameOrigin } from "@/lib/auth/request-security";
import { deleteCompanies } from "@/lib/companies/repository";

const requestSchema = z.object({ ids: z.array(z.string().min(1)).min(1).max(100) });

export async function DELETE(request: NextRequest) {
  try {
    requireSameOrigin(request);
    const actor = await requireAuthenticatedUser({ permission: Permission.DELETE_COMPANIES });
    const { ids } = requestSchema.parse(await request.json());
    const deleted = await deleteCompanies(ids, actor.id);
    return NextResponse.json({ ok: true, deleted });
  } catch (error) { return errorResponse(error, "Unable to delete companies"); }
}
