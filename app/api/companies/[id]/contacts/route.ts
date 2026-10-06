import { Permission } from "@prisma/client"; import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/auth/errors"; import { requireSameOrigin } from "@/lib/auth/request-security"; import { requireAuthenticatedUser } from "@/lib/auth/session"; import { createContact } from "@/lib/companies/repository";
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) { try { requireSameOrigin(request); const actor = await requireAuthenticatedUser({ permission: Permission.UPDATE_COMPANIES }); return NextResponse.json(await createContact((await context.params).id, await request.json(), actor.id), { status: 201 }); } catch (error) { return errorResponse(error, "Unable to add contact"); } }

