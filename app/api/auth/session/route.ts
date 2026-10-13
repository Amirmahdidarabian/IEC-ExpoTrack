import { getCurrentUser } from "@/lib/auth/session";
import { errorResponse } from "@/lib/auth/errors";

export async function GET() {
  try {
    const user = await getCurrentUser();
    return Response.json({ authenticated: Boolean(user) }, { status: user ? 200 : 401, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error, "Unable to check your session.");
  }
}
