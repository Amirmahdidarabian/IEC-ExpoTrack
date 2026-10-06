import { Permission } from "@prisma/client"; import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/auth/errors"; import { requireSameOrigin } from "@/lib/auth/request-security"; import { requireAuthenticatedUser } from "@/lib/auth/session"; import { toggleCompanySaved } from "@/lib/companies/repository";
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) { try { requireSameOrigin(request); await requireAuthenticatedUser({ permission: Permission.VIEW_COMPANIES }); return NextResponse.json(await toggleCompanySaved((await context.params).id)); } catch (error) { return errorResponse(error, "Unable to update saved company"); } }

