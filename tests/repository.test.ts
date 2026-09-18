import { describe, expect, it } from "vitest";
import { listExhibitions } from "@/lib/exhibitions/repository";

describe("exhibition queries", () => {
  it("sorts nearest first by start date ascending", async () => {
    const result = await listExhibitions({ sort: "nearest", pageSize: 50 });
    const values = result.items.map((item) => new Date(item.startDate).getTime());
    expect(values).toEqual([...values].sort((a, b) => a - b));
  });
  it("searches across city and topics", async () => {
    expect((await listExhibitions({ q: "Singapore" })).items.some((item) => item.slug === "gastech-2026")).toBe(true);
    expect((await listExhibitions({ q: "Hydrogen" })).items.length).toBeGreaterThan(0);
  });
});
