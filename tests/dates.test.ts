import { describe, expect, it } from "vitest";
import DateObject from "react-date-object";
import persian from "react-date-object/calendars/persian";
import persian_fa from "react-date-object/locales/persian_fa";
import { dateObjectToCanonical, formatEventDate, formatPersianDate, formatPersianEventDate, getDurationDays, getEventStatus, normalizeDateOnly } from "@/lib/exhibitions/dates";

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
  it("derives Persian display from the same canonical dates", () => {
    expect(formatPersianDate("2026-09-15T12:00:00.000Z")).toBe("۲۴ شهریور ۱۴۰۵");
    expect(formatPersianEventDate("2026-09-15T12:00:00.000Z", "2026-09-18T12:00:00.000Z")).toBe("۲۴–۲۷ شهریور ۱۴۰۵");
  });
  it("converts Persian selection to the canonical Gregorian day", () => {
    const selected = new DateObject({ year: 1405, month: 6, day: 24, calendar: persian, locale: persian_fa });
    expect(dateObjectToCanonical(selected)).toBe("2026-09-15T12:00:00.000Z");
  });
  it("keeps the calendar day stable when normalizing date-only input", () => expect(normalizeDateOnly("2026-09-15")).toBe("2026-09-15T12:00:00.000Z"));
  it("supports a same-day exhibition", () => expect(getDurationDays("2026-09-15", "2026-09-15")).toBe(1));
});
