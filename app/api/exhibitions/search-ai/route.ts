import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { searchExhibitionsWithAI } from "@/lib/exhibitions/ai-provider";

const querySchema = z.object({ query: z.string().trim().min(2).max(180) });

export async function POST(request: NextRequest) {
  try {
    const { query } = querySchema.parse(await request.json());
    return NextResponse.json(await searchExhibitionsWithAI(query));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Search failed" }, { status: 400 });
  }
}
