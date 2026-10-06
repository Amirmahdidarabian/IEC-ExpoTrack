import { Permission } from "@prisma/client";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireAuthenticatedUser: vi.fn(), updateCompanyPriority: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ requireAuthenticatedUser: mocks.requireAuthenticatedUser }));
vi.mock("@/lib/companies/repository", () => ({ updateCompanyPriority: mocks.updateCompanyPriority }));

import { PATCH } from "@/app/api/companies/[id]/priority/route";

describe("company priority route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuthenticatedUser.mockResolvedValue({ id: "actor-1" });
    mocks.updateCompanyPriority.mockResolvedValue({ id: "company-1", priorityScore: 82 });
  });

  it("updates only priority with the company update permission", async () => {
    const request = new NextRequest("http://localhost/api/companies/company-1/priority", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ priorityScore: 82 }) });
    const response = await PATCH(request, { params: Promise.resolve({ id: "company-1" }) });
    expect(response.status).toBe(200);
    expect(mocks.requireAuthenticatedUser).toHaveBeenCalledWith({ permission: Permission.UPDATE_COMPANIES });
    expect(mocks.updateCompanyPriority).toHaveBeenCalledWith("company-1", { priorityScore: 82 }, "actor-1");
  });
});
