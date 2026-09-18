import { differenceInCalendarDays, differenceInMinutes, format } from "date-fns";

export type EventState = "upcoming" | "ongoing" | "past";

function dateValue(value: string | Date | null | undefined, fallback?: string | Date) {
  const result = value ? new Date(value) : fallback ? new Date(fallback) : null;
  return result && !Number.isNaN(result.getTime()) ? result : null;
}

export function getEventStatus(startValue: string | Date, endValue?: string | Date | null, nowValue: string | Date = new Date()) {
  const start = dateValue(startValue);
  const end = dateValue(endValue, startValue);
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
    const day = Math.max(1, differenceInCalendarDays(now, start) + 1);
    const duration = getDurationDays(start, end);
    return { state: "ongoing" as EventState, label: "Live now", detail: `Day ${Math.min(day, duration)} of ${duration}`, days: 0, hours: 0, minutes: 0 };
  }
  return { state: "past" as EventState, label: "Ended", detail: format(end, "dd MMM yyyy"), days: 0, hours: 0, minutes: 0 };
}

export function getDurationDays(startValue: string | Date, endValue?: string | Date | null) {
  const start = dateValue(startValue);
  const end = dateValue(endValue, startValue);
  if (!start || !end || end < start) return 1;
  return differenceInCalendarDays(end, start) + 1;
}

export function formatEventDate(startValue: string | Date, endValue?: string | Date | null, long = false) {
  const start = dateValue(startValue);
  const end = dateValue(endValue, startValue);
  if (!start || !end) return "Date unavailable";
  if (start.toDateString() === end.toDateString()) return format(start, long ? "dd MMMM yyyy" : "dd MMM yyyy");
  if (start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth()) {
    return `${format(start, "dd")}–${format(end, long ? "dd MMMM yyyy" : "dd MMM yyyy")}`;
  }
  return `${format(start, long ? "dd MMMM yyyy" : "dd MMM yyyy")} – ${format(end, long ? "dd MMMM yyyy" : "dd MMM yyyy")}`;
}
