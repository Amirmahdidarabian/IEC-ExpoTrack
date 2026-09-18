import { describe, expect, it } from "vitest";
import { formatEventDate, getDurationDays, getEventStatus } from "@/lib/exhibitions/dates";

describe("exhibition dates", () => {
  it("reports a future exhibition with a live countdown", () => {
    const status = getEventStatus("2027-04-06T10:00:00+04:00", "2027-04-08T18:00:00+04:00", "2027-04-01T10:00:00+04:00");
    expect(status.state).toBe("upcoming"); expect(status.days).toBe(5);
  });
  it("reports an ongoing exhibition and day number", () => {
    const status = getEventStatus("2027-04-06T10:00:00Z", "2027-04-08T18:00:00Z", "2027-04-07T12:00:00Z");
    expect(status).toMatchObject({ state: "ongoing", detail: "Day 2 of 3" });
  });
  it("reports a past exhibition", () => expect(getEventStatus("2025-04-07T09:00:00Z", "2025-04-13T18:00:00Z", "2026-01-01T00:00:00Z").state).toBe("past"));
  it("derives inclusive multi-day duration", () => expect(getDurationDays("2026-09-15T09:00:00Z", "2026-09-18T18:00:00Z")).toBe(4));
  it("formats a same-month range without contradiction", () => expect(formatEventDate("2026-09-15T09:00:00Z", "2026-09-18T18:00:00Z")).toBe("15–18 Sep 2026"));
});
