import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "@/lib/auth/errors";

const mocks = vi.hoisted(() => ({ authError: null as HttpError | null, requireAuthenticatedUser: vi.fn(), assertImportFile: vi.fn(), previewCompanyImport: vi.fn(), importCompanies: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ requireAuthenticatedUser: mocks.requireAuthenticatedUser }));
vi.mock("@/lib/companies/import", () => ({ MAX_COMPANY_IMPORT_BYTES: 20 * 1024 * 1024, CompanyImportError: class CompanyImportError extends Error {}, assertImportFile: mocks.assertImportFile, previewCompanyImport: mocks.previewCompanyImport, importCompanies: mocks.importCompanies }));
import { POST } from "@/app/api/companies/import/route";

function request(mode = "preview") { const form = new FormData(); form.set("file", new File(["xlsx"], "companies.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })); form.set("mode", mode); return new NextRequest("http://localhost/api/companies/import", { method: "POST", body: form }); }

describe("company import route", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.authError = null; mocks.requireAuthenticatedUser.mockImplementation(() => { if (mocks.authError) throw mocks.authError; return Promise.resolve({ id: "admin-1" }); }); mocks.previewCompanyImport.mockResolvedValue({ validRows: 1 }); mocks.importCompanies.mockResolvedValue({ createdCompanies: 1 }); });
  it("rejects unauthorized import before reading the workbook", async () => { mocks.authError = new HttpError("Forbidden", 403); const response = await POST(request()); expect(response.status).toBe(403); expect(mocks.previewCompanyImport).not.toHaveBeenCalled(); });
  it("returns a server-validated preview", async () => { const response = await POST(request()); expect(response.status).toBe(200); expect(await response.json()).toEqual({ validRows: 1 }); expect(mocks.assertImportFile).toHaveBeenCalledOnce(); });
  it("runs the tracked import with the authenticated actor", async () => { const response = await POST(request("import")); expect(response.status).toBe(200); expect(mocks.importCompanies).toHaveBeenCalledWith(expect.any(Buffer), "companies.xlsx", {}, "admin-1", false, undefined); });
  it("passes an optional destination folder to the importer", async () => { const form = new FormData(); form.set("file", new File(["xlsx"], "companies.xlsx")); form.set("mode", "import"); form.set("folderId", "folder-one"); await POST(new NextRequest("http://localhost/api/companies/import", { method: "POST", body: form })); expect(mocks.importCompanies).toHaveBeenCalledWith(expect.any(Buffer), "companies.xlsx", {}, "admin-1", false, "folder-one"); });
  it("rejects oversized multipart bodies before parsing", async () => { const response = await POST(new NextRequest("http://localhost/api/companies/import", { method: "POST", headers: { "content-type": "multipart/form-data; boundary=x", "content-length": String(22 * 1024 * 1024) }, body: "--x--" })); expect(response.status).toBe(413); expect(mocks.previewCompanyImport).not.toHaveBeenCalled(); });
});
