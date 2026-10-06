import { Permission } from "@prisma/client";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "@/lib/auth/errors";

const mocks = vi.hoisted(() => ({ authError: null as HttpError | null, requireAuthenticatedUser: vi.fn(), createCompany: vi.fn(), listCompanies: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ requireAuthenticatedUser: mocks.requireAuthenticatedUser }));
vi.mock("@/lib/companies/repository", () => ({ createCompany: mocks.createCompany, listCompanies: mocks.listCompanies, DuplicateCompanyError: class DuplicateCompanyError extends Error {} }));
import { GET, POST } from "@/app/api/companies/route";

describe("company routes", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.authError = null; mocks.requireAuthenticatedUser.mockImplementation(({ permission }) => { if (mocks.authError) throw mocks.authError; return Promise.resolve({ id: "actor-1", permissions: [permission] }); }); mocks.listCompanies.mockResolvedValue({ items: [], total: 0 }); mocks.createCompany.mockResolvedValue({ id: "company-1", name: "Example" }); });
  it("requires the company view permission before listing", async () => { mocks.authError = new HttpError("Forbidden", 403); const response = await GET(new NextRequest("http://localhost/api/companies")); expect(response.status).toBe(403); expect(mocks.listCompanies).not.toHaveBeenCalled(); });
  it("requires create permission and uses the authenticated actor", async () => { const request = new NextRequest("http://localhost/api/companies", { method: "POST", body: JSON.stringify({ name: "Example" }), headers: { "content-type": "application/json" } }); const response = await POST(request); expect(response.status).toBe(201); expect(mocks.requireAuthenticatedUser).toHaveBeenCalledWith({ permission: Permission.CREATE_COMPANIES }); expect(mocks.createCompany).toHaveBeenCalledWith({ name: "Example" }, "actor-1", false); });
  it("rejects unauthenticated creation before repository mutation", async () => { mocks.authError = new HttpError("Authentication required.", 401); const response = await POST(new NextRequest("http://localhost/api/companies", { method: "POST", body: "{}", headers: { "content-type": "application/json" } })); expect(response.status).toBe(401); expect(mocks.createCompany).not.toHaveBeenCalled(); });
});
