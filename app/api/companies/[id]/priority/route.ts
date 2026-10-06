import { Permission } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/auth/errors";
import { requireSameOrigin } from "@/lib/auth/request-security";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { updateCompanyPriority } from "@/lib/companies/repository";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: Context) {
  try {
    requireSameOrigin(request);
    const actor = await requireAuthenticatedUser({ permission: Permission.UPDATE_COMPANIES });
    return NextResponse.json(await updateCompanyPriority((await context.params).id, await request.json(), actor.id));
  } catch (error) {
    return errorResponse(error, "Unable to update company priority");
  }
}
