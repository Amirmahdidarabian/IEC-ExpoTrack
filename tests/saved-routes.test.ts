import { beforeEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "@/lib/auth/errors";

const mocks = vi.hoisted(() => ({
  actor: vi.fn(async () => ({ id: "user-1" })),
  exhibitions: vi.fn(async () => [{ id: "older-saved-event", saved: true }]),
  companies: vi.fn(async () => [{ id: "saved-company", name: "Saved company" }]),
}));
vi.mock("@/lib/auth/session", () => ({ requireAuthenticatedUser: mocks.actor }));
vi.mock("@/lib/exhibitions/repository", () => ({ listSavedExhibitions: mocks.exhibitions }));
vi.mock("@/lib/prisma", () => ({ prisma: { company: { findMany: mocks.companies } } }));
import { GET as exhibitions } from "@/app/api/exhibitions/saved/route";
import { GET as companies } from "@/app/api/companies/saved/route";

beforeEach(() => vi.clearAllMocks());
describe("saved collection endpoints", () => {
  it("queries the saved exhibition collection directly and prevents stale caching", async () => {
    const response = await exhibitions();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual([{ id: "older-saved-event", saved: true }]);
    expect(mocks.actor).toHaveBeenCalledWith({ permission: "VIEW_EXHIBITIONS" });
    expect(mocks.exhibitions).toHaveBeenCalledExactlyOnceWith();
  });
  it("filters saved companies at the database and prevents stale caching", async () => {
    const response = await companies();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(mocks.actor).toHaveBeenCalledWith({ permission: "VIEW_COMPANIES" });
    expect(mocks.companies).toHaveBeenCalledWith(expect.objectContaining({ where: { saved: true } }));
  });
  it("does not bypass permissions or query private data when access is denied", async () => {
    mocks.actor.mockRejectedValueOnce(new HttpError("Forbidden", 403));
    expect((await exhibitions()).status).toBe(403);
    expect(mocks.exhibitions).not.toHaveBeenCalled();
    mocks.actor.mockRejectedValueOnce(new HttpError("Authentication required", 401));
    expect((await companies()).status).toBe(401);
    expect(mocks.companies).not.toHaveBeenCalled();
  });
});
