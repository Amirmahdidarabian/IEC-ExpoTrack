import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  actor: vi.fn(async () => ({ id: "user-1" })),
  sameOrigin: vi.fn(),
  setStatus: vi.fn(async () => ({ id: "expo-1", exhibitorList: true, exhibitorListWithLink: true })),
}));
vi.mock("@/lib/auth/session", () => ({ requireAuthenticatedUser: mocks.actor }));
vi.mock("@/lib/auth/request-security", () => ({ requireSameOrigin: mocks.sameOrigin }));
vi.mock("@/lib/exhibitions/repository", () => ({ setExhibitorListStatus: mocks.setStatus }));
import { PATCH } from "@/app/api/exhibitions/[id]/exhibitor-list/route";
import { HttpError } from "@/lib/auth/errors";

function request(body: object) {
  return new NextRequest("http://localhost/api/exhibitions/expo-1/exhibitor-list", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}
const context = { params: Promise.resolve({ id: "expo-1" }) };
beforeEach(() => { vi.clearAllMocks(); mocks.actor.mockResolvedValue({ id: "user-1" }); mocks.sameOrigin.mockImplementation(() => undefined); });

describe("exhibitor list link classification", () => {
  it("requires update permission and persists the selected status", async () => {
    const response = await PATCH(request({ available: true, withLink: true }), context);
    expect(response.status).toBe(200);
    expect(mocks.actor).toHaveBeenCalledWith({ permission: "UPDATE_EXHIBITIONS" });
    expect(mocks.sameOrigin).toHaveBeenCalledOnce();
    expect(mocks.setStatus).toHaveBeenCalledWith("expo-1", true, "user-1", true);
  });
  it("accepts legacy payloads and rejects invalid checkbox values", async () => {
    expect((await PATCH(request({ available: true }), context)).status).toBe(200);
    expect(mocks.setStatus).toHaveBeenCalledWith("expo-1", true, "user-1", false);
    mocks.setStatus.mockClear();
    expect((await PATCH(request({ available: true, withLink: "yes" }), context)).status).toBe(400);
    expect(mocks.setStatus).not.toHaveBeenCalled();
  });
  it("does not write when authorization or origin checks fail", async () => {
    mocks.actor.mockRejectedValueOnce(new HttpError("Forbidden", 403));
    expect((await PATCH(request({ available: true, withLink: true }), context)).status).toBe(403);
    mocks.sameOrigin.mockImplementationOnce(() => { throw new HttpError("Forbidden", 403); });
    expect((await PATCH(request({ available: true }), context)).status).toBe(403);
    expect(mocks.setStatus).not.toHaveBeenCalled();
  });
});
