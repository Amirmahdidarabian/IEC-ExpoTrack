import { Permission } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/auth/errors";
import { requireSameOrigin } from "@/lib/auth/request-security";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { deleteCompany, DuplicateCompanyError, getCompany, updateCompany } from "@/lib/companies/repository";

type Context = { params: Promise<{ id: string }> };
export async function GET(_: NextRequest, context: Context) { try { await requireAuthenticatedUser({ permission: Permission.VIEW_COMPANIES }); const item = await getCompany((await context.params).id); return item ? NextResponse.json(item) : NextResponse.json({ error: "Company not found." }, { status: 404 }); } catch (error) { return errorResponse(error, "Unable to load company"); } }
export async function PATCH(request: NextRequest, context: Context) { try { requireSameOrigin(request); const actor = await requireAuthenticatedUser({ permission: Permission.UPDATE_COMPANIES }); const payload = await request.json(); return NextResponse.json(await updateCompany((await context.params).id, payload.company ?? payload, actor.id, payload.duplicateResolution === "keep-both")); } catch (error) { if (error instanceof DuplicateCompanyError) return NextResponse.json({ code: error.code, error: error.message, duplicates: error.duplicates }, { status: 409 }); return errorResponse(error, "Unable to update company"); } }
export async function DELETE(request: NextRequest, context: Context) { try { requireSameOrigin(request); const actor = await requireAuthenticatedUser({ permission: Permission.DELETE_COMPANIES }); await deleteCompany((await context.params).id, actor.id); return NextResponse.json({ ok: true }); } catch (error) { return errorResponse(error, "Unable to delete company"); } }

