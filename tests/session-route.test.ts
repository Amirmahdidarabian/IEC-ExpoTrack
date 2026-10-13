import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ currentUser: vi.fn<() => Promise<object | null>>(async () => ({ id: "user-1", username: "private" })) }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.currentUser }));
import { GET } from "@/app/api/auth/session/route";

describe("idle session check", () => {
  beforeEach(() => { mocks.currentUser.mockResolvedValue({ id: "user-1", username: "private" }); });
  it("reports an active session without exposing user data and disables caching", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ authenticated: true });
  });
  it("returns 401 for an expired session", async () => {
    mocks.currentUser.mockResolvedValue(null);
    const response = await GET();
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ authenticated: false });
  });
});
