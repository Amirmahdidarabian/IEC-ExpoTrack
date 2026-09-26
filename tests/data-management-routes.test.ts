import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "@/lib/auth/errors";
import { MAX_IMPORT_BYTES } from "@/lib/data-management/schema";

const mocks = vi.hoisted(() => ({
  adminError: null as HttpError | null,
  requireAdminUser: vi.fn(), createExport: vi.fn(), previewImport: vi.fn(), importBackup: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ requireAdminUser: mocks.requireAdminUser }));
vi.mock("@/lib/data-management/service", () => ({ createExport: mocks.createExport, previewImport: mocks.previewImport, importBackup: mocks.importBackup }));

import { POST as exportData } from "@/app/api/admin/data/export/route";
import { POST as previewData } from "@/app/api/admin/data/preview/route";
import { POST as importData } from "@/app/api/admin/data/import/route";

const valid = { format: "iec-expotrack", version: 1, exportedAt: "2026-09-26T15:45:00.000Z", data: { categories: [], topics: [], exhibitions: [] } };
function upload(value: unknown, name = "backup.json") {
  const form = new FormData(); form.set("file", new File([JSON.stringify(value)], name, { type: "application/json" }));
  return new NextRequest("http://localhost/api/admin/data/preview", { method: "POST", body: form });
}

describe("admin data routes", () => {
  beforeEach(() => {
    vi.clearAllMocks(); mocks.adminError = null;
    mocks.requireAdminUser.mockImplementation(() => { if (mocks.adminError) throw mocks.adminError; return Promise.resolve({ id: "admin-1", role: "ADMIN" }); });
    mocks.createExport.mockResolvedValue(valid); mocks.previewImport.mockResolvedValue({ exhibitions: 0, categories: 0, topics: 0 }); mocks.importBackup.mockResolvedValue({ exhibitions: { processed: 0, created: 0, updated: 0, skipped: 0 }, categories: { processed: 0 }, topics: { processed: 0 }, errors: 0 });
  });
  it("rejects unauthenticated and non-admin export attempts", async () => {
    mocks.adminError = new HttpError("Authentication required.", 401); expect((await exportData(new NextRequest("http://localhost/api/admin/data/export", { method: "POST" }))).status).toBe(401);
    mocks.adminError = new HttpError("Administrator access required.", 403); expect((await exportData(new NextRequest("http://localhost/api/admin/data/export", { method: "POST" }))).status).toBe(403);
    expect(mocks.createExport).not.toHaveBeenCalled();
  });
  it("rejects unauthorized preview and import before parsing a file", async () => {
    mocks.adminError = new HttpError("Administrator access required.", 403);
    expect((await previewData(new NextRequest("http://localhost/api/admin/data/preview", { method: "POST" }))).status).toBe(403);
    expect((await importData(new NextRequest("http://localhost/api/admin/data/import", { method: "POST" }))).status).toBe(403);
    expect(mocks.previewImport).not.toHaveBeenCalled(); expect(mocks.importBackup).not.toHaveBeenCalled();
  });
  it("rejects malformed and unsupported backups without calling preview", async () => {
    const malformed = new FormData(); malformed.set("file", new File(["{"], "bad.json", { type: "application/json" }));
    const malformedResponse = await previewData(new NextRequest("http://localhost/api/admin/data/preview", { method: "POST", body: malformed }));
    expect(malformedResponse.status).toBe(400);
    const versionResponse = await previewData(upload({ ...valid, version: 2 })); expect(versionResponse.status).toBe(400); expect(mocks.previewImport).not.toHaveBeenCalled();
  });
  it("rejects oversized uploads before multipart parsing", async () => {
    const response = await previewData(new NextRequest("http://localhost/api/admin/data/preview", { method: "POST", headers: { "content-type": "multipart/form-data; boundary=test", "content-length": String(MAX_IMPORT_BYTES + 600_000) }, body: "--test--" }));
    expect(response.status).toBe(413); expect(mocks.previewImport).not.toHaveBeenCalled();
  });
  it("requires a json extension and accepts a validated json preview", async () => {
    expect((await previewData(upload(valid, "backup.txt"))).status).toBe(415);
    const response = await previewData(upload(valid)); expect(response.status).toBe(200); expect(mocks.previewImport).toHaveBeenCalledOnce();
  });
});
