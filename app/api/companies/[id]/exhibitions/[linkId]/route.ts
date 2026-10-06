import { Permission } from "@prisma/client"; import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/auth/errors"; import { requireSameOrigin } from "@/lib/auth/request-security"; import { requireAuthenticatedUser } from "@/lib/auth/session"; import { unlinkExhibition } from "@/lib/companies/repository";
export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string; linkId: string }> }) { try { requireSameOrigin(request); const actor = await requireAuthenticatedUser({ permission: Permission.UPDATE_COMPANIES }); const p = await context.params; await unlinkExhibition(p.id, p.linkId, actor.id); return NextResponse.json({ ok: true }); } catch (error) { return errorResponse(error, "Unable to unlink exhibition"); } }

