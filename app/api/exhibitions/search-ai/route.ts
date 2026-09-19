import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { searchExhibitionsWithAI } from "@/lib/exhibitions/ai-provider";
import { Permission } from "@prisma/client";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { errorResponse } from "@/lib/auth/errors";

const querySchema = z.object({ query: z.string().trim().min(2).max(180) });

export async function POST(request: NextRequest) {
  try {
    await requireAuthenticatedUser({ permission: Permission.CREATE_EXHIBITIONS });
    const { query } = querySchema.parse(await request.json());
    return NextResponse.json(await searchExhibitionsWithAI(query));
  } catch (error) {
    return errorResponse(error, "Search failed");
  }
}
