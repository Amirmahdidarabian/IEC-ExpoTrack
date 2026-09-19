import { NextRequest, NextResponse } from "next/server";

const SESSION_COOKIE = "iec_session";

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const publicApi = pathname === "/api/auth/login";
  const protectedPath = pathname.startsWith("/exhibitions") || pathname.startsWith("/saved") || pathname.startsWith("/admin") || pathname.startsWith("/settings") || (pathname.startsWith("/api/") && !publicApi);
  if (protectedPath && !request.cookies.has(SESSION_COOKIE)) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    const login = new URL("/login", request.url);
    login.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(login);
  }
  if (pathname === "/login" && request.cookies.has(SESSION_COOKIE)) return NextResponse.redirect(new URL("/exhibitions", request.url));
  return NextResponse.next();
}

export const config = { matcher: ["/login", "/exhibitions/:path*", "/saved/:path*", "/admin/:path*", "/settings/:path*", "/api/:path*"] };
