import { Permission } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/auth/errors";
import { requireSameOrigin } from "@/lib/auth/request-security";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { createCompany, DuplicateCompanyError, listCompanies } from "@/lib/companies/repository";
import { parseCompanyQuery } from "@/lib/companies/query";

export async function GET(request: NextRequest) { try { await requireAuthenticatedUser({ permission: Permission.VIEW_COMPANIES }); return NextResponse.json(await listCompanies(parseCompanyQuery(Object.fromEntries(request.nextUrl.searchParams)))); } catch (error) { return errorResponse(error, "Unable to load companies"); } }
export async function POST(request: NextRequest) { try { requireSameOrigin(request); const actor = await requireAuthenticatedUser({ permission: Permission.CREATE_COMPANIES }); const payload = await request.json(); return NextResponse.json(await createCompany(payload.company ?? payload, actor.id, payload.duplicateResolution === "keep-both"), { status: 201 }); } catch (error) { if (error instanceof DuplicateCompanyError) return NextResponse.json({ code: error.code, error: error.message, duplicates: error.duplicates }, { status: 409 }); return errorResponse(error, "Unable to create company"); } }

