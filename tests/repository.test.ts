import { describe, expect, it } from "vitest";
import { createExhibition, deleteExhibition, listExhibitions, listHomeExhibitions, setVisitorMessagingStatus, sortItems } from "@/lib/exhibitions/repository";
import { seedExhibitions } from "@/lib/exhibitions/seed-data";
import type { Exhibition } from "@/lib/exhibitions/types";

function event(id: string, startDate: string, endDate: string | null = startDate): Exhibition {
  return { id, slug: id, name: id, tagline: "", industry: "Energy", eventType: "Exhibition", country: "Germany", countryCode: "DE", city: "", venue: "", address: "", startDate, endDate, timezone: "Europe/Berlin", organizer: "", website: "", exhibitorListUrl: "", description: "", aiReport: "", topics: [], categories: [], topicItems: [], saved: false, createdAt: startDate, updatedAt: startDate, sources: [] };
}

describe("exhibition queries", () => {
  it("provides the full upcoming catalog to the home deck, not only five cards", async () => {
    const items = await listHomeExhibitions(new Date("2026-10-01T12:00:00Z"));
    expect(items.length).toBeGreaterThan(5);
    expect(items.map((item) => new Date(item.startDate).getTime())).toEqual(
      [...items].map((item) => new Date(item.startDate).getTime()).sort((a, b) => a - b),
    );
  });
  it("sorts upcoming exhibitions nearest first by start date", async () => {
    const result = await listExhibitions({ sort: "nearest", pageSize: 50 });
    const upcoming = result.items.filter((item) => new Date(item.startDate) > new Date()).map((item) => new Date(item.startDate).getTime());
    expect(upcoming).toEqual([...upcoming].sort((a, b) => a - b));
  });
  it("searches across city and topics", async () => {
    expect((await listExhibitions({ q: "Singapore" })).items.some((item) => item.slug === "gastech-2026")).toBe(true);
    expect((await listExhibitions({ q: "Hydrogen" })).items.length).toBeGreaterThan(0);
  });
  it("returns every matching exhibition in All mode and resets stale page numbers", async () => {
    const result = await listExhibitions({ pageSize: "all", page: 8, q: "Hydrogen" });
    expect(result.items.length).toBe(result.total);
    expect(result.page).toBe(1);
    expect(result.pageCount).toBe(1);
    expect(result.items.every((item) => [item.name, item.industry, ...item.topics].join(" ").includes("Hydrogen"))).toBe(true);
  });
  it("does not silently cap All at 200 records", async () => {
    const store = globalThis as unknown as { iecDemoExhibitions: Exhibition[] };
    const original = store.iecDemoExhibitions;
    try {
      store.iecDemoExhibitions = Array.from({ length: 230 }, (_, index) => event(`all-${index}`, "2028-01-01T12:00:00Z"));
      expect((await listExhibitions({ pageSize: "all" })).items).toHaveLength(230);
      expect((await listExhibitions({ pageSize: 200 })).items).toHaveLength(200);
    } finally { store.iecDemoExhibitions = original; }
  });
  it("filters exhibitions by visitor-messaging availability", async () => {
    await setVisitorMessagingStatus("gastech-2026", true, "user-1");
    try {
      expect((await listExhibitions({ visitorMessaging: true })).items.some((item) => item.id === "gastech-2026")).toBe(true);
      expect((await listExhibitions({ visitorMessaging: false })).items.some((item) => item.id === "gastech-2026")).toBe(false);
    } finally {
      await setVisitorMessagingStatus("gastech-2026", false, "user-1");
    }
  });
  it("orders ongoing, then future nearest-first, then recently ended", () => {
    const items = [event("april", "2027-04-06T12:00:00Z"), event("past-old", "2026-08-01T12:00:00Z"), event("november", "2026-11-11T12:00:00Z"), event("ongoing", "2026-09-17T12:00:00Z", "2026-09-20T12:00:00Z"), event("october", "2026-10-05T12:00:00Z"), event("september", "2026-09-25T12:00:00Z")];
    expect(sortItems(items, "nearest", "2026-09-18T12:00:00Z").map((item) => item.id)).toEqual(["ongoing", "september", "october", "november", "april", "past-old"]);
  });
  it("keeps development CRUD functional when PostgreSQL is unavailable", async () => {
    const source = seedExhibitions[0];
    const created = await createExhibition({
      name: `Repository smoke ${Date.now()}`, tagline: "", industry: source.industry,
      categoryIds: source.categories.map((item) => item.id), topicIds: source.topicItems.slice(0, 1).map((item) => item.id),
      eventType: source.eventType, country: source.country, countryCode: source.countryCode, city: source.city,
      venue: "", address: "", startDate: "2028-06-01T12:00:00.000Z", endDate: null,
      timezone: source.timezone, organizer: "", website: "", exhibitorListUrl: "", description: "", aiReport: "", topics: [], sources: [],
    }, { allowDuplicate: true });
    expect(created.countryCode).toBe("SG");
    expect(created.categories[0]?.id).toBe(source.categories[0].id);
    await deleteExhibition(created.id);
  });
});
