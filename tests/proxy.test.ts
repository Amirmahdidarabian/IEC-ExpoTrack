import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { proxy } from "@/proxy";

describe("authentication proxy", () => {
  it("lets the login page validate a possibly stale session cookie", () => {
    const response = proxy(new NextRequest("https://iecexpotracker.com/login", {
      headers: { cookie: "iec_session=stale-session" },
    }));

    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("still redirects unauthenticated protected pages to login", () => {
    const response = proxy(new NextRequest("https://iecexpotracker.com/exhibitions?view=all"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://iecexpotracker.com/login?next=%2Fexhibitions%3Fview%3Dall");
  });
});
