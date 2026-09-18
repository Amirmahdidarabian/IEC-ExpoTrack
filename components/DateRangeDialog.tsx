"use client";

import { CalendarDays, Check, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Calendar } from "react-multi-date-picker";
import DateObject from "react-date-object";
import gregorian from "react-date-object/calendars/gregorian";
import persian from "react-date-object/calendars/persian";
import gregorian_en from "react-date-object/locales/gregorian_en";
import persian_fa from "react-date-object/locales/persian_fa";
import { dateObjectToCanonical, formatEventDate, formatPersianDate, getDurationDays, toDateInputValue } from "@/lib/exhibitions/dates";
import { Modal } from "./Modal";

type CalendarMode = "gregorian" | "persian";

function asDateObject(value: string, mode: CalendarMode) {
  const base = new DateObject({ date: toDateInputValue(value), format: "YYYY-MM-DD", calendar: gregorian, locale: gregorian_en });
  return mode === "persian" ? base.convert(persian, persian_fa) : base;
}

export function DateRangeDialog({ startDate, endDate, onApply, onClose }: { startDate: string; endDate: string | null; onApply: (start: string, end: string | null) => void; onClose: () => void }) {
  const [mode, setMode] = useState<CalendarMode>("gregorian");
  const [range, setRange] = useState<string[]>(() => [startDate, endDate].filter(Boolean) as string[]);
  const [months, setMonths] = useState(2);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 600px)");
    const sync = () => setMonths(query.matches ? 1 : 2);
    sync(); query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);
  const calendarValue = useMemo(() => range.map((value) => asDateObject(value, mode)), [range, mode]);
  const start = range[0] ?? "";
  const end = range[1] ?? range[0] ?? "";
  return <Modal onClose={onClose} label="Select date range" className="date-range-modal">
    <header className="date-dialog-heading"><span><CalendarDays /></span><div><h2>Select Date Range</h2><p>Choose the start and end date for the exhibition.</p></div></header>
    <div className="calendar-mode" role="tablist" aria-label="Calendar system">
      <button role="tab" aria-selected={mode === "gregorian"} className={mode === "gregorian" ? "active" : ""} onClick={() => setMode("gregorian")}><CalendarDays /> Gregorian <b>(میلادی)</b></button>
      <button role="tab" aria-selected={mode === "persian"} className={mode === "persian" ? "active" : ""} onClick={() => setMode("persian")}><CalendarDays /> Persian <b dir="rtl">(شمسی)</b></button>
    </div>
    <div className={`calendar-host ${mode === "persian" ? "rtl-calendar" : ""}`}>
      <Calendar
        range
        rangeHover
        numberOfMonths={months}
        value={calendarValue}
        calendar={mode === "persian" ? persian : gregorian}
        locale={mode === "persian" ? persian_fa : gregorian_en}
        format="YYYY-MM-DD"
        onChange={(values) => setRange(values.map(dateObjectToCanonical))}
        className="iec-calendar"
      />
    </div>
    <section className="date-summary" aria-live="polite"><h3><CalendarDays /> Selected Dates</h3><div className="date-summary-grid">
      <div><small>Start date</small>{start ? <><b>{formatEventDate(start, start, true)}</b><span dir="rtl" lang="fa">{formatPersianDate(start)}</span></> : <b>Not selected</b>}</div>
      <i>→</i>
      <div><small>End date</small>{end ? <><b>{formatEventDate(end, end, true)}</b><span dir="rtl" lang="fa">{formatPersianDate(end)}</span></> : <b>Not selected</b>}</div>
      <div className="duration"><small>Duration</small><b>{start ? `${getDurationDays(start, end)} ${getDurationDays(start, end) === 1 ? "Day" : "Days"}` : "—"}</b></div>
    </div></section>
    <footer className="date-dialog-actions"><button className="button outline" onClick={() => setRange([])}><Trash2 /> Clear</button><span /><button className="button outline violet" onClick={onClose}>Cancel</button><button className="button primary" disabled={!start} onClick={() => onApply(start, end || null)}><Check /> Apply Dates</button></footer>
  </Modal>;
}
