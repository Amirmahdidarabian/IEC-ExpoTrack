import { describe, expect, it, vi } from "vitest";
import { MAX_IMPORT_BYTES, parseBackupText } from "@/lib/data-management/schema";
import { readBackupUpload } from "@/lib/data-management/request";
import { importUserProfiles, sanitizeBackupJson } from "@/lib/data-management/full-service";
import { fullBackup } from "./fixtures/full-backup";
import type { Prisma } from "@prisma/client";

describe("full application JSON backup", () => {
  it("round trips every section, nested data, saved state and relationships", () => {
    const value = fullBackup(); expect(parseBackupText(JSON.stringify(value))).toEqual(value);
    expect(value.data.companies[0]).toMatchObject({ saved: true, priorityScore: 80, folders: [{ folderId: "folder-1" }], exhibitions: [{ exhibitionId: "expo-1" }] });
  });
  it("requires all sections in v2, not a partial backup disguised as complete", () => {
    const value = fullBackup(); const data = value.data as unknown as Record<string, unknown>; delete data.media;
    expect(() => parseBackupText(JSON.stringify(value))).toThrow("Invalid IEC backup");
    expect(() => parseBackupText(JSON.stringify({ ...value, version: 99 }))).toThrow("Invalid IEC backup");
  });
  it.each(["folder", "exhibition", "category", "topic", "user", "import job"])("rejects a broken %s reference before any write", kind => {
    const value = fullBackup();
    if (kind === "folder") value.data.companies[0].folders[0].folderId = "missing";
    if (kind === "exhibition") value.data.companies[0].exhibitions[0].exhibitionId = "missing";
    if (kind === "category") value.data.media[0].categoryIds = ["missing"];
    if (kind === "topic") value.data.companies[0].topicIds = ["missing"];
    if (kind === "user") value.data.media[0].createdById = "missing";
    if (kind === "import job") value.data.media[0].sources[0].importJobId = "missing";
    expect(() => parseBackupText(JSON.stringify(value))).toThrow("Unknown relationship reference");
  });
  it("rejects duplicate memberships, child IDs, identity keys and primary contacts", () => {
    const values = [fullBackup(), fullBackup(), fullBackup(), fullBackup()];
    values[0].data.companies[0].folders.push({ ...values[0].data.companies[0].folders[0] });
    values[1].data.companies[0].contacts.push({ ...values[1].data.companies[0].contacts[0], isPrimary: false });
    values[2].data.media.push({ ...values[2].data.media[0], id: "media-2", contacts: [], notes: [], sources: [] });
    values[3].data.media[0].contacts.push({ ...values[3].data.media[0].contacts[0], id: "media-contact-2", importKey: "editor-2" });
    for (const value of values) expect(() => parseBackupText(JSON.stringify(value))).toThrow("Invalid IEC backup");
  });
  it("allows the same media email for different labelled contacts", () => {
    const value = fullBackup(); value.data.media[0].contacts.push({ ...value.data.media[0].contacts[0], id: "media-contact-2", importKey: "editor-2", roleLabel: "Business Editor", isPrimary: false });
    expect(parseBackupText(JSON.stringify(value)).version).toBe(2);
  });
  it.each(["passwordHash", "sessions", "tokenHash", "AUTH_SECRET"])("rejects injected account %s fields", key => {
    const value = fullBackup(); Object.assign(value.data.administration.users[0], { [key]: "never-accept" });
    expect(() => parseBackupText(JSON.stringify(value))).toThrow("Unrecognized key");
  });
  it("redacts credential-bearing metadata recursively without losing useful source data", () => {
    expect(sanitizeBackupJson({ rows: [{ email: "editor@example.com", password: "private", cookie: "private" }], AUTH_SECRET: "private", fileHash: "digest", value: "postgresql://private-connection", nested: { apiKey: "private", tokenHash: "private" } })).toEqual({ rows: [{ email: "editor@example.com", password: "[REDACTED]", cookie: "[REDACTED]" }], AUTH_SECRET: "[REDACTED]", fileHash: "digest", value: "[REDACTED]", nested: { apiKey: "[REDACTED]", tokenHash: "[REDACTED]" } });
  });
  it("bounds chunked uploads without trusting a missing Content-Length header", async () => {
    let cancelled = false;
    const body = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(MAX_IMPORT_BYTES + 512 * 1024 + 1)); }, cancel() { cancelled = true; } });
    const request = new Request("http://localhost/api/admin/data/preview", { method: "POST", headers: { "content-type": "multipart/form-data; boundary=test" }, body, duplex: "half" } as RequestInit);
    await expect(readBackupUpload(request)).rejects.toMatchObject({ status: 413 }); expect(cancelled).toBe(true);
  });
});

describe("safe account restoration", () => {
  function client(rows: Array<{ id: string; username: string }>) { const user = { findMany: vi.fn().mockResolvedValue(rows), create: vi.fn() }; return { user, tx: { user } as unknown as Prisma.TransactionClient }; }
  it("does not change an existing account, even if a backup requests ADMIN or active access", async () => {
    const { tx, user } = client([{ id: "target-user", username: "backup-user" }]); const source = fullBackup().data.administration.users; source[0].role = "ADMIN";
    expect((await importUserProfiles(tx, source)).get("user-1")).toBe("target-user"); expect(user.create).not.toHaveBeenCalled();
  });
  it("creates only disabled profiles with unusable random credentials", async () => {
    const { tx, user } = client([]); await importUserProfiles(tx, fullBackup().data.administration.users);
    expect(user.create).toHaveBeenCalledWith({ data: expect.objectContaining({ isActive: false, mustChangePassword: true, passwordHash: expect.stringMatching(/^!disabled-backup-/), permissions: { create: [{ permission: "VIEW_COMPANIES" }, { permission: "VIEW_MEDIA" }] } }) });
  });
  it("aborts rather than attach history to a conflicting user identity", async () => {
    const { tx, user } = client([{ id: "user-1", username: "someone-else" }]);
    await expect(importUserProfiles(tx, fullBackup().data.administration.users)).rejects.toThrow("identity conflicts"); expect(user.create).not.toHaveBeenCalled();
  });
});
