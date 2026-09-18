import { differenceInCalendarDays, differenceInMinutes, format } from "date-fns";
import DateObject from "react-date-object";
import gregorian from "react-date-object/calendars/gregorian";
import persian from "react-date-object/calendars/persian";
import gregorian_en from "react-date-object/locales/gregorian_en";
import persian_fa from "react-date-object/locales/persian_fa";

export type EventState = "upcoming" | "ongoing" | "past";

const datePrefix = /^(\d{4})-(\d{2})-(\d{2})/;

function calendarParts(value: string | Date | null | undefined) {
  if (!value) return null;
  if (typeof value === "string") {
    const match = value.match(datePrefix);
    if (match) return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

function safeDisplayDate(value: string | Date | null | undefined) {
  const parts = calendarParts(value);
  return parts ? new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12)) : null;
}

function dateValue(value: string | Date | null | undefined, fallback?: string | Date) {
  const result = value ? new Date(value) : fallback ? new Date(fallback) : null;
  return result && !Number.isNaN(result.getTime()) ? result : null;
}

function zonedBoundary(value: string | Date, timezone: string, endOfDay = false) {
  if (typeof value !== "string" || !value.includes("T12:00:00.000Z") || !timezone) return dateValue(value);
  const parts = calendarParts(value)!;
  try {
    const target = Date.UTC(parts.year, parts.month - 1, parts.day, endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0);
    const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
    const displayed = Object.fromEntries(formatter.formatToParts(new Date(target)).filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)]));
    const offset = Date.UTC(displayed.year, displayed.month - 1, displayed.day, displayed.hour, displayed.minute, displayed.second) - target;
    return new Date(target - offset);
  } catch { return dateValue(value); }
}

/** Date-only values use noon UTC so the chosen day cannot drift in normal timezones. */
export function normalizeDateOnly(value: string | Date | null | undefined) {
  const parts = calendarParts(value);
  if (!parts) return null;
  const year = String(parts.year).padStart(4, "0");
  const month = String(parts.month).padStart(2, "0");
  const day = String(parts.day).padStart(2, "0");
  return `${year}-${month}-${day}T12:00:00.000Z`;
}

export function toDateInputValue(value: string | Date | null | undefined) {
  const parts = calendarParts(value);
  if (!parts) return "";
  return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

export function getEventStatus(startValue: string | Date, endValue?: string | Date | null, nowValue: string | Date = new Date(), timezone = "UTC") {
  const start = zonedBoundary(startValue, timezone);
  const end = zonedBoundary(endValue ?? startValue, timezone, true);
  const now = dateValue(nowValue)!;
  if (!start || !end) return { state: "past" as EventState, label: "Date unavailable", detail: "" };
  if (now < start) {
    const totalMinutes = Math.max(0, differenceInMinutes(start, now));
    const days = Math.floor(totalMinutes / 1440);
    const hours = Math.floor((totalMinutes % 1440) / 60);
    const minutes = totalMinutes % 60;
    return { state: "upcoming" as EventState, label: "Upcoming", detail: days === 0 ? `In ${hours} hours` : `In ${days} ${days === 1 ? "day" : "days"}`, days, hours, minutes };
  }
  if (now <= end) {
    const day = Math.max(1, differenceInCalendarDays(safeDisplayDate(now)!, safeDisplayDate(start)!) + 1);
    const duration = getDurationDays(startValue, endValue);
    return { state: "ongoing" as EventState, label: "Live now", detail: `Day ${Math.min(day, duration)} of ${duration}`, days: 0, hours: 0, minutes: 0 };
  }
  return { state: "past" as EventState, label: "Ended", detail: format(safeDisplayDate(end)!, "dd MMM yyyy"), days: 0, hours: 0, minutes: 0 };
}

export function getDurationDays(startValue: string | Date, endValue?: string | Date | null) {
  const start = safeDisplayDate(startValue);
  const end = safeDisplayDate(endValue ?? startValue);
  if (!start || !end || end < start) return 1;
  return differenceInCalendarDays(end, start) + 1;
}

export function formatEventDate(startValue: string | Date, endValue?: string | Date | null, long = false) {
  const start = safeDisplayDate(startValue);
  const end = safeDisplayDate(endValue ?? startValue);
  if (!start || !end) return "Date unavailable";
  if (start.getTime() === end.getTime()) return format(start, long ? "dd MMMM yyyy" : "dd MMM yyyy");
  if (start.getUTCFullYear() === end.getUTCFullYear() && start.getUTCMonth() === end.getUTCMonth()) return `${format(start, "dd")}–${format(end, long ? "dd MMMM yyyy" : "dd MMM yyyy")}`;
  return `${format(start, long ? "dd MMMM yyyy" : "dd MMM yyyy")} – ${format(end, long ? "dd MMMM yyyy" : "dd MMM yyyy")}`;
}

function persianDate(value: string | Date) {
  const parts = calendarParts(value);
  if (!parts) return null;
  return new DateObject({ ...parts, calendar: gregorian, locale: gregorian_en }).convert(persian, persian_fa);
}

export function formatPersianDate(value: string | Date, long = true) {
  return persianDate(value)?.format(long ? "D MMMM YYYY" : "D MMM YYYY") ?? "تاریخ نامشخص";
}

export function formatPersianEventDate(startValue: string | Date, endValue?: string | Date | null, long = true) {
  const start = persianDate(startValue);
  const end = persianDate(endValue ?? startValue);
  if (!start || !end) return "تاریخ نامشخص";
  if (start.year === end.year && start.month.number === end.month.number && start.day === end.day) return start.format(long ? "D MMMM YYYY" : "D MMM YYYY");
  if (start.year === end.year && start.month.number === end.month.number) return `${start.format("D")}–${end.format(long ? "D MMMM YYYY" : "D MMM YYYY")}`;
  return `${start.format(long ? "D MMMM YYYY" : "D MMM YYYY")} – ${end.format(long ? "D MMMM YYYY" : "D MMM YYYY")}`;
}

export function dateObjectToCanonical(value: DateObject) {
  const converted = new DateObject(value).convert(gregorian, gregorian_en);
  return normalizeDateOnly(`${converted.year}-${String(converted.month.number).padStart(2, "0")}-${String(converted.day).padStart(2, "0")}`)!;
}
