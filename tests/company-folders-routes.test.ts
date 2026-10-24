import { NextRequest } from "next/server";
import { Permission } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "@/lib/auth/errors";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), list: vi.fn(), save: vi.fn(), remove: vi.fn(), membership: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ requireAuthenticatedUser: mocks.auth }));
vi.mock("@/lib/companies/folders", () => ({ listCompanyFolders: mocks.list, saveCompanyFolder: mocks.save, deleteCompanyFolder: mocks.remove, changeFolderMembership: mocks.membership }));
import { GET, POST } from "@/app/api/companies/folders/route";
import { DELETE, PATCH } from "@/app/api/companies/folders/[id]/route";
import { POST as membership } from "@/app/api/companies/folders/membership/route";
const context = { params: Promise.resolve({ id: "folder" }) };
function request(method = "POST", body = {}, origin?: string) { return new NextRequest("http://localhost/api/companies/folders", { method, headers: { "Content-Type": "application/json", ...(origin ? { origin } : {}) }, body: JSON.stringify(body) }); }
describe("company folder routes", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.auth.mockResolvedValue({ id: "actor" }); mocks.list.mockResolvedValue({ folders: [] }); mocks.save.mockResolvedValue({ id: "folder" }); mocks.membership.mockResolvedValue({ changed: 1 }); });
  it("requires view permission to browse folders", async () => { expect((await GET()).status).toBe(200); expect(mocks.auth).toHaveBeenCalledWith({ permission: Permission.VIEW_COMPANIES }); });
  it("rejects unauthenticated mutations before repository access", async () => { mocks.auth.mockRejectedValue(new HttpError("Authentication required", 401)); expect((await POST(request())).status).toBe(401); expect(mocks.save).not.toHaveBeenCalled(); });
  it("uses update permission and actor identity for creation, rename and delete", async () => {
    expect((await POST(request("POST", { name: "ROV" }))).status).toBe(201);
    expect(mocks.save).toHaveBeenCalledWith({ name: "ROV" }, "actor");
    await PATCH(request("PATCH", { name: "USV" }), context); expect(mocks.save).toHaveBeenCalledWith({ name: "USV" }, "actor", "folder");
    await DELETE(request("DELETE"), context); expect(mocks.remove).toHaveBeenCalledWith("folder", "actor");
    expect(mocks.auth).toHaveBeenCalledWith({ permission: Permission.UPDATE_COMPANIES });
  });
  it("rejects cross-origin folder and membership writes", async () => {
    expect((await POST(request("POST", {}, "https://untrusted.example"))).status).toBe(403);
    expect((await membership(request("POST", {}, "https://untrusted.example"))).status).toBe(403);
    expect(mocks.save).not.toHaveBeenCalled(); expect(mocks.membership).not.toHaveBeenCalled();
  });
  it("persists only authenticated membership operations", async () => {
    const body = { companyIds: ["company"], folderId: "folder", action: "remove" };
    expect((await membership(request("POST", body))).status).toBe(200);
    expect(mocks.membership).toHaveBeenCalledWith(body, "actor");
  });
});
