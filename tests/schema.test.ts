import { describe, expect, it } from "vitest";
import { exhibitionSchema } from "@/lib/exhibitions/schema";

const valid = { name: "Future Energy 2027", country: "Germany", startDate: "2027-03-01T09:00:00Z", endDate: "2027-03-03T17:00:00Z", website: "https://example.com" };

describe("exhibition validation", () => {
  it("accepts a safe exhibition payload", () => expect(exhibitionSchema.safeParse(valid).success).toBe(true));
  it("rejects end dates before start dates", () => expect(exhibitionSchema.safeParse({ ...valid, endDate: "2027-02-28T09:00:00Z" }).success).toBe(false));
  it("rejects unsafe URL protocols", () => expect(exhibitionSchema.safeParse({ ...valid, website: "javascript:alert(1)" }).success).toBe(false));
  it("requires name and country", () => expect(exhibitionSchema.safeParse({ ...valid, name: "", country: "" }).success).toBe(false));
});
