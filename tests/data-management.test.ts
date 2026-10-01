import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const tx = {
    industryCategory: { findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
    topic: { findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
    exhibition: { findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
    auditLog: { create: vi.fn() },
  };
  return { tx, transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)) };
});

vi.mock("@/lib/prisma", () => ({ prisma: { ...mocks.tx, $transaction: mocks.transaction } }));

import { createExport, importBackup, previewImport } from "@/lib/data-management/service";
import { BACKUP_FORMAT, BACKUP_VERSION, parseBackupText, type BackupDocument } from "@/lib/data-management/schema";

const date = "2026-09-26T15:45:00.000Z";
function backup(): BackupDocument {
  return {
    format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: date,
    data: {
      categories: [{ id: "cat-1", name: "Energy", normalizedName: "energy", slug: "energy", createdAt: date, updatedAt: date }],
      topics: [{ id: "topic-1", name: "Hydrogen", normalizedName: "hydrogen", slug: "hydrogen", createdAt: date, updatedAt: date }],
      exhibitions: [{ id: "expo-1", slug: "energy-2027", name: "Energy 2027", tagline: "", industry: "Energy", eventType: "Exhibition", country: "Germany", countryCode: "DE", city: "Berlin", venue: "IEC", address: "", startDate: "2027-01-01T00:00:00.000Z", endDate: null, timezone: "Europe/Berlin", organizer: "IEC", website: "https://example.com", exhibitorListUrl: "https://example.com/exhibitors", description: "Description", aiReport: "Report", topics: ["Hydrogen"], saved: false, exhibitorList: true, preEventEmailSent: true, preEventEmailSentAt: date, postEventEmailSent: false, postEventEmailSentAt: null, createdAt: date, updatedAt: date, categoryIds: ["cat-1"], topicIds: ["topic-1"], sources: [{ id: "source-1", label: "Official", url: "https://example.com", lastChecked: date, priority: 1 }] }],
    },
  };
}

describe("IEC backup validation", () => {
  it("accepts the documented versioned format", () => expect(parseBackupText(JSON.stringify(backup()))).toEqual(backup()));
  it("rejects invalid JSON, format and unsupported versions", () => {
    expect(() => parseBackupText("not json")).toThrow("not valid JSON");
    expect(() => parseBackupText(JSON.stringify({ ...backup(), format: "other" }))).toThrow("Invalid IEC backup");
    expect(() => parseBackupText(JSON.stringify({ ...backup(), version: 2 }))).toThrow("Invalid IEC backup");
  });
  it("rejects invalid relationships, duplicate IDs and actor/mass-assignment fields", () => {
    const missing = backup(); missing.data.exhibitions[0].categoryIds = ["missing"];
    expect(() => parseBackupText(JSON.stringify(missing))).toThrow("Unknown category reference");
    const duplicate = backup(); duplicate.data.topics.push({ ...duplicate.data.topics[0] });
    expect(() => parseBackupText(JSON.stringify(duplicate))).toThrow("Duplicate id");
    const injected = backup() as BackupDocument & { createdById?: string }; (injected.data.exhibitions[0] as unknown as Record<string, unknown>).createdById = "spoofed-user";
    expect(() => parseBackupText(JSON.stringify(injected))).toThrow("Unrecognized key");
  });
  it("rejects prototype-related keys and excessive nesting", () => {
    expect(() => parseBackupText('{"format":"iec-expotrack","version":1,"exportedAt":"2026-09-26T15:45:00.000Z","data":{"categories":[],"topics":[],"exhibitions":[]},"constructor":{}}')).toThrow("forbidden property");
    let nested: unknown = "value"; for (let index = 0; index < 40; index++) nested = { child: nested };
    expect(() => parseBackupText(JSON.stringify(nested))).toThrow("nested too deeply");
  });
});

describe("export and import services", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.tx.industryCategory.findMany.mockResolvedValue([]); mocks.tx.topic.findMany.mockResolvedValue([]); mocks.tx.exhibition.findMany.mockResolvedValue([]);
    mocks.tx.industryCategory.create.mockResolvedValue({}); mocks.tx.industryCategory.update.mockResolvedValue({}); mocks.tx.topic.create.mockResolvedValue({}); mocks.tx.topic.update.mockResolvedValue({}); mocks.tx.exhibition.create.mockResolvedValue({}); mocks.tx.exhibition.update.mockResolvedValue({}); mocks.tx.auditLog.create.mockResolvedValue({});
  });
  it("exports exhibition relations and follow-up state without security data", async () => {
    mocks.tx.industryCategory.findMany.mockResolvedValueOnce([{ id: "cat-1", name: "Energy", normalizedName: "energy", slug: "energy", createdAt: new Date(date), updatedAt: new Date(date) }]);
    mocks.tx.topic.findMany.mockResolvedValueOnce([{ id: "topic-1", name: "Hydrogen", normalizedName: "hydrogen", slug: "hydrogen", createdAt: new Date(date), updatedAt: new Date(date) }]);
    mocks.tx.exhibition.findMany.mockResolvedValueOnce([{ ...backup().data.exhibitions[0], startDate: new Date("2027-01-01"), endDate: null, preEventEmailSentAt: new Date(date), postEventEmailSentAt: null, createdAt: new Date(date), updatedAt: new Date(date), topics: ["Hydrogen"], categories: [{ categoryId: "cat-1" }], topicLinks: [{ topicId: "topic-1" }], sources: [{ id: "source-1", label: "Official", url: "https://example.com", lastChecked: new Date(date), priority: 1 }] }]);
    const value = await createExport("admin-1"); const serialized = JSON.stringify(value);
    expect(value).toMatchObject({ format: BACKUP_FORMAT, version: 1, data: { exhibitions: [{ exhibitorList: true, exhibitorListUrl: "https://example.com/exhibitors", preEventEmailSent: true, categoryIds: ["cat-1"], topicIds: ["topic-1"] }] } });
    expect(serialized).not.toMatch(/passwordHash|passwords|sessions|tokenHash|tokens|AUTH_SECRET|OPENAI_API_KEY|DATABASE_URL|POSTGRES_PASSWORD/);
    expect(mocks.tx.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ actorUserId: "admin-1", action: "EXPORT_DATA" }) });
  });
  it("previews without mutations and imports new records in one transaction", async () => {
    const value = backup(); const preview = await previewImport(value);
    expect(preview).toMatchObject({ newRecords: 3, existingRecords: 0, invalidRecords: 0 });
    expect(mocks.tx.industryCategory.create).not.toHaveBeenCalled();
    const result = await importBackup(value, "admin-1", "backup.json");
    expect(mocks.transaction).toHaveBeenCalledOnce(); expect(result.exhibitions).toMatchObject({ created: 1, updated: 0 });
    expect(mocks.tx.exhibition.create).toHaveBeenCalledWith({ data: expect.objectContaining({ id: "expo-1", createdBy: { connect: { id: "admin-1" } } }) });
    expect(mocks.tx.exhibition.create).toHaveBeenCalledWith({ data: expect.objectContaining({ categories: { create: [{ categoryId: "cat-1" }] }, topicLinks: { create: [{ topicId: "topic-1" }] }, sources: { create: [expect.objectContaining({ label: "Official" })] } }) });
    expect(mocks.tx.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ actorUserId: "admin-1", action: "IMPORT_DATA", metadata: expect.objectContaining({ filename: "backup.json", numberCreated: 1 }) }) });
  });
  it("updates stable matches instead of creating duplicates on repeated import", async () => {
    mocks.tx.industryCategory.findMany.mockResolvedValue([{ id: "cat-1", normalizedName: "energy", slug: "energy" }]); mocks.tx.topic.findMany.mockResolvedValue([{ id: "topic-1", normalizedName: "hydrogen", slug: "hydrogen" }]); mocks.tx.exhibition.findMany.mockResolvedValue([{ id: "expo-1", slug: "energy-2027" }]);
    const result = await importBackup(backup(), "admin-1", "backup.json");
    expect(result.exhibitions).toMatchObject({ created: 0, updated: 1 }); expect(mocks.tx.exhibition.update).toHaveBeenCalledOnce(); expect(mocks.tx.exhibition.create).not.toHaveBeenCalled();
  });
  it("keeps the audit write inside the transaction and propagates a failed import", async () => {
    mocks.tx.topic.create.mockRejectedValueOnce(new Error("constraint"));
    await expect(importBackup(backup(), "admin-1", "backup.json")).rejects.toThrow("constraint");
    expect(mocks.transaction).toHaveBeenCalledOnce(); expect(mocks.tx.exhibition.create).not.toHaveBeenCalled(); expect(mocks.tx.auditLog.create).not.toHaveBeenCalled();
  });
});
