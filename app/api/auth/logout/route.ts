import { NextResponse } from "next/server";
import { clearSession } from "@/lib/auth/session";
import { requireSameOrigin } from "@/lib/auth/request-security";
import { errorResponse } from "@/lib/auth/errors";

export async function POST(request: Request) {
  try { requireSameOrigin(request); await clearSession(); return NextResponse.json({ ok: true }); }
  catch (error) { return errorResponse(error, "Unable to sign out."); }
}
