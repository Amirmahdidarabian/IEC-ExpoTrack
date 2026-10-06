import { Permission } from "@prisma/client"; import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/auth/errors"; import { requireSameOrigin } from "@/lib/auth/request-security"; import { requireAuthenticatedUser } from "@/lib/auth/session"; import { updateTaxonomyLinks } from "@/lib/companies/repository";
export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) { try { requireSameOrigin(request); const actor = await requireAuthenticatedUser({ permission: Permission.UPDATE_COMPANIES }); await updateTaxonomyLinks((await context.params).id, await request.json(), actor.id); return NextResponse.json({ ok: true }); } catch (error) { return errorResponse(error, "Unable to update classifications"); } }

