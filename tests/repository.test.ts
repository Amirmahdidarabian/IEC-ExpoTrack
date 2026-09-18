import { describe, expect, it } from "vitest";
import { listExhibitions, sortItems } from "@/lib/exhibitions/repository";
import type { Exhibition } from "@/lib/exhibitions/types";

function event(id: string, startDate: string, endDate: string | null = startDate): Exhibition {
  return { id, slug: id, name: id, tagline: "", industry: "Energy", eventType: "Exhibition", country: "Germany", countryCode: "DE", city: "", venue: "", address: "", startDate, endDate, timezone: "Europe/Berlin", organizer: "", website: "", description: "", aiReport: "", topics: [], categories: [], topicItems: [], saved: false, createdAt: startDate, updatedAt: startDate, sources: [] };
}

describe("exhibition queries", () => {
  it("sorts upcoming exhibitions nearest first by start date", async () => {
    const result = await listExhibitions({ sort: "nearest", pageSize: 50 });
    const upcoming = result.items.filter((item) => new Date(item.startDate) > new Date()).map((item) => new Date(item.startDate).getTime());
    expect(upcoming).toEqual([...upcoming].sort((a, b) => a - b));
  });
  it("searches across city and topics", async () => {
    expect((await listExhibitions({ q: "Singapore" })).items.some((item) => item.slug === "gastech-2026")).toBe(true);
    expect((await listExhibitions({ q: "Hydrogen" })).items.length).toBeGreaterThan(0);
  });
  it("orders ongoing, then future nearest-first, then recently ended", () => {
    const items = [event("april", "2027-04-06T12:00:00Z"), event("past-old", "2026-08-01T12:00:00Z"), event("november", "2026-11-11T12:00:00Z"), event("ongoing", "2026-09-17T12:00:00Z", "2026-09-20T12:00:00Z"), event("october", "2026-10-05T12:00:00Z"), event("september", "2026-09-25T12:00:00Z")];
    expect(sortItems(items, "nearest", "2026-09-18T12:00:00Z").map((item) => item.id)).toEqual(["ongoing", "september", "october", "november", "april", "past-old"]);
  });
});
