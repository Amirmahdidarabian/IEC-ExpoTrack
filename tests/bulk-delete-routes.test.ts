import { Permission } from "@prisma/client";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "@/lib/auth/errors";

const mocks = vi.hoisted(() => ({
  authError: null as HttpError | null,
  requireAuthenticatedUser: vi.fn(),
  deleteCompanies: vi.fn(),
  deleteExhibitions: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ requireAuthenticatedUser: mocks.requireAuthenticatedUser }));
vi.mock("@/lib/companies/repository", () => ({ deleteCompanies: mocks.deleteCompanies }));
vi.mock("@/lib/exhibitions/repository", () => ({ deleteExhibitions: mocks.deleteExhibitions }));

import { DELETE as deleteCompanies } from "@/app/api/companies/bulk-delete/route";
import { DELETE as deleteExhibitions } from "@/app/api/exhibitions/bulk-delete/route";

function request(path: string, ids: string[]) {
  return new NextRequest(`http://localhost${path}`, { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ ids }) });
}

describe("bulk delete routes", () => {
  beforeEach(() => {
    vi.clearAllMocks(); mocks.authError = null;
    mocks.requireAuthenticatedUser.mockImplementation(() => { if (mocks.authError) throw mocks.authError; return Promise.resolve({ id: "actor-1" }); });
    mocks.deleteCompanies.mockResolvedValue(2); mocks.deleteExhibitions.mockResolvedValue(2);
  });

  it("deletes selected companies with the company delete permission", async () => {
    const response = await deleteCompanies(request("/api/companies/bulk-delete", ["company-1", "company-2"]));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, deleted: 2 });
    expect(mocks.requireAuthenticatedUser).toHaveBeenCalledWith({ permission: Permission.DELETE_COMPANIES });
    expect(mocks.deleteCompanies).toHaveBeenCalledWith(["company-1", "company-2"], "actor-1");
  });

  it("deletes selected exhibitions with the exhibition delete permission", async () => {
    const response = await deleteExhibitions(request("/api/exhibitions/bulk-delete", ["exhibition-1", "exhibition-2"]));
    expect(response.status).toBe(200);
    expect(mocks.requireAuthenticatedUser).toHaveBeenCalledWith({ permission: Permission.DELETE_EXHIBITIONS });
    expect(mocks.deleteExhibitions).toHaveBeenCalledWith(["exhibition-1", "exhibition-2"], "actor-1");
  });

  it("rejects empty selections before repository deletion", async () => {
    const response = await deleteCompanies(request("/api/companies/bulk-delete", []));
    expect(response.status).toBe(400);
    expect(mocks.deleteCompanies).not.toHaveBeenCalled();
  });

  it("rejects unauthorized bulk deletion", async () => {
    mocks.authError = new HttpError("Forbidden", 403);
    const response = await deleteExhibitions(request("/api/exhibitions/bulk-delete", ["exhibition-1"]));
    expect(response.status).toBe(403);
    expect(mocks.deleteExhibitions).not.toHaveBeenCalled();
  });

  it("explains when a selected exhibition is still linked to a company", async () => {
    mocks.deleteExhibitions.mockRejectedValue(Object.assign(new Error("Foreign key constraint"), { code: "P2003" }));
    const response = await deleteExhibitions(request("/api/exhibitions/bulk-delete", ["exhibition-1"]));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "Unlink the selected exhibitions from all companies before deleting them." });
  });
});
