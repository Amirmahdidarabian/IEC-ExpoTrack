import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { searchExhibitionsWithAI } from "@/lib/exhibitions/ai-provider";
import { Permission } from "@prisma/client";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { errorResponse } from "@/lib/auth/errors";
import { requireSameOrigin } from "@/lib/auth/request-security";
import { HttpError } from "@/lib/auth/errors";

const querySchema = z.object({ query: z.string().trim().min(2).max(180) });
const researchAttempts = new Map<string, { count: number; resetAt: number }>();
const RESEARCH_WINDOW = 5 * 60 * 1000;
const RESEARCH_LIMIT = 10;

export async function POST(request: NextRequest) {
  try {
    requireSameOrigin(request);
    const actor = await requireAuthenticatedUser({ permission: Permission.CREATE_EXHIBITIONS });
    const now = Date.now(); const current = researchAttempts.get(actor.id);
    if (current && current.resetAt > now && current.count >= RESEARCH_LIMIT) throw new HttpError("Research limit reached. Try again in a few minutes.", 429);
    if (researchAttempts.size > 5_000) for (const [key, value] of researchAttempts) if (value.resetAt <= now) researchAttempts.delete(key);
    researchAttempts.set(actor.id, current && current.resetAt > now ? { ...current, count: current.count + 1 } : { count: 1, resetAt: now + RESEARCH_WINDOW });
    const { query } = querySchema.parse(await request.json());
    return NextResponse.json(await searchExhibitionsWithAI(query));
  } catch (error) {
    return errorResponse(error, "Search failed");
  }
}
