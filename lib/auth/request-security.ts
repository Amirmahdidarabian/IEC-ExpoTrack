import { HttpError } from "./errors";

export function requireSameOrigin(request: Request) {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite === "cross-site") throw new HttpError("Cross-site request rejected.", 403);
  const origin = request.headers.get("origin");
  if (!origin) return;
  try {
    const internalUrl = new URL(request.url);
    const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
    const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
    const protocol = forwardedProto ? `${forwardedProto}:` : internalUrl.protocol;
    const host = forwardedHost || request.headers.get("host")?.trim() || internalUrl.host;
    if (!host || !["http:", "https:"].includes(protocol)) throw new Error("Invalid forwarded origin");
    const requestOrigin = new URL(`${protocol}//${host}`).origin;
    if (new URL(origin).origin !== requestOrigin) throw new HttpError("Cross-site request rejected.", 403);
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError("Invalid request origin.", 403);
  }
}
