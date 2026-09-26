import { HttpError } from "./errors";

export function requireSameOrigin(request: Request) {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite === "cross-site") throw new HttpError("Cross-site request rejected.", 403);
  const origin = request.headers.get("origin");
  if (!origin) return;
  let requestOrigin: string;
  try { requestOrigin = new URL(request.url).origin; } catch { throw new HttpError("Invalid request origin.", 403); }
  if (origin !== requestOrigin) throw new HttpError("Cross-site request rejected.", 403);
}
