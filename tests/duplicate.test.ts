import { describe, expect, it } from "vitest";
import { duplicateScore, findLikelyDuplicates, normalizeExhibitionName } from "@/lib/exhibitions/duplicate";
import type { Exhibition, ExhibitionInput } from "@/lib/exhibitions/types";

const base: Exhibition = { id: "gastech", slug: "gastech-2026", name: "Gastech 2026", tagline: "", industry: "Energy", eventType: "Exhibition", country: "Singapore", city: "Singapore", venue: "Singapore EXPO", address: "", startDate: "2026-09-15T12:00:00.000Z", endDate: "2026-09-18T12:00:00.000Z", timezone: "Asia/Singapore", organizer: "DMG Events", website: "", description: "", aiReport: "", topics: [], saved: false, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", sources: [] };
function incoming(name: string, overrides: Partial<ExhibitionInput> = {}): ExhibitionInput { return { ...base, name, ...overrides, sources: [] }; }

describe("duplicate detection", () => {
  it("normalizes case, punctuation and harmless exhibition wording", () => expect(normalizeExhibitionName("GASTECH-2026 Exhibition")).toBe(normalizeExhibitionName("Gastech 2026")));
  it("flags case-only and punctuation-only variants", () => {
    expect(findLikelyDuplicates([base], incoming("GASTECH 2026"))).toHaveLength(1);
    expect(findLikelyDuplicates([base], incoming("Gastech-2026"))).toHaveLength(1);
  });
  it("normally separates the same series in a different year", () => expect(findLikelyDuplicates([base], incoming("Gastech 2027", { startDate: "2027-09-15T12:00:00.000Z" }))).toHaveLength(0));
  it("reduces confidence when country and date differ", () => expect(duplicateScore(base, incoming("Gastech Energy", { country: "Germany", startDate: "2028-03-01T12:00:00.000Z" }))).toBeLessThan(65));
});
