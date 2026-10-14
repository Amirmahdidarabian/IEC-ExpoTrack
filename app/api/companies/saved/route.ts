import { Permission } from "@prisma/client";
import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/auth/errors";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

export async function GET() { try { await requireAuthenticatedUser({ permission: Permission.VIEW_COMPANIES }); return NextResponse.json(await prisma.company.findMany({ where: { saved: true }, orderBy: { name: "asc" }, select: { id: true, name: true, domain: true, country: true, countryCode: true, priorityScore: true } }), { headers: { "Cache-Control": "no-store" } }); } catch (error) { return errorResponse(error, "Unable to load saved companies"); } }

