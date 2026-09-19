import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const record = { id: "expo-1", slug: "energy-2027", name: "Energy 2027", tagline: "", industry: "Energy", eventType: "Exhibition", country: "Germany", countryCode: "DE", city: "Berlin", venue: "", address: "", startDate: new Date("2027-01-01T00:00:00Z"), endDate: null, timezone: "Europe/Berlin", organizer: "", website: "", description: "", aiReport: "", topics: [], saved: false, preEventEmailSent: true, preEventEmailSentAt: new Date(), postEventEmailSent: false, postEventEmailSentAt: null, createdAt: new Date(), updatedAt: new Date(), sources: [], categories: [], topicLinks: [], createdBy: null, updatedBy: null, preEventEmailSentBy: { id: "user-1", username: "sara" }, postEventEmailSentBy: null };
  const tx = { exhibition: { findUniqueOrThrow: vi.fn(() => ({ id: record.id, name: record.name })), update: vi.fn(() => record) }, auditLog: { create: vi.fn(() => ({})) } };
  return { tx, transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)) };
});

vi.mock("@/lib/prisma", () => ({ prisma: { $transaction: mocks.transaction } }));
import { setEmailFollowUpStatus } from "@/lib/exhibitions/repository";

describe("manual email follow-up transaction", () => {
  beforeEach(() => vi.clearAllMocks());
  it("updates pre-event attribution and creates the sent audit event atomically", async () => {
    await setEmailFollowUpStatus("expo-1", "pre", true, "user-1");
    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(mocks.tx.exhibition.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ preEventEmailSent: true, preEventEmailSentById: "user-1" }) }));
    expect(mocks.tx.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: "PRE_EVENT_EMAIL_MARKED_SENT", actorUserId: "user-1" }) });
  });
  it("clears visible post-event attribution while retaining an unsent audit event", async () => {
    await setEmailFollowUpStatus("expo-1", "post", false, "user-1");
    expect(mocks.tx.exhibition.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ postEventEmailSent: false, postEventEmailSentAt: null, postEventEmailSentById: null }) }));
    expect(mocks.tx.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: "POST_EVENT_EMAIL_MARKED_UNSENT" }) });
  });
});
