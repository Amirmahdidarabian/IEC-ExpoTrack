"use client";

import { CalendarDays, FileText, MapPin, Network, Sparkles, Tag } from "lucide-react";
import { useState } from "react";
import { formatEventDate, formatPersianDate } from "@/lib/exhibitions/dates";
import type { ExhibitionInput } from "@/lib/exhibitions/types";
import { DateRangeDialog } from "./DateRangeDialog";

type TextFieldProps = { name: keyof ExhibitionInput; label: string; type?: string; required?: boolean; placeholder?: string; value: ExhibitionInput; onChange: (value: ExhibitionInput) => void; errors: Record<string, string>; aiFilled?: Set<string> };

function TextField({ name, label, type = "text", required = false, placeholder = "", value, onChange, errors, aiFilled }: TextFieldProps) {
  return <label className={`field ${aiFilled?.has(String(name)) ? "ai-filled" : ""}`}><span>{label}{required && " *"}{aiFilled?.has(String(name)) && <small>Filled by AI</small>}</span><input type={type} required={required} placeholder={placeholder} value={(value[name] as string | null) ?? ""} onChange={(event) => onChange({ ...value, [name]: event.target.value || (name === "endDate" ? null : "") })} />{errors[name] && <em>{errors[name]}</em>}</label>;
}

function DateButton({ label, value, required, error, onClick }: { label: string; value: string | null; required?: boolean; error?: string; onClick: () => void }) {
  return <div className="field date-field"><span>{label}{required && " *"}</span><button type="button" onClick={onClick} className={value ? "has-date" : ""}><CalendarDays /><span>{value ? <><b>{formatEventDate(value, value, true)}</b><small dir="rtl" lang="fa">{formatPersianDate(value)}</small></> : <b>Select date</b>}</span></button>{error && <em>{error}</em>}</div>;
}

export function ExhibitionForm({ value, onChange, errors = {}, onSearchAi, aiState = "idle", aiMessage = "", aiFilled = new Set<string>() }: { value: ExhibitionInput; onChange: (value: ExhibitionInput) => void; errors?: Record<string, string>; onSearchAi?: () => void; aiState?: "idle" | "loading" | "error" | "success"; aiMessage?: string; aiFilled?: Set<string> }) {
  const [dateOpen, setDateOpen] = useState(false);
  const set = (key: keyof ExhibitionInput, next: string | string[] | null) => onChange({ ...value, [key]: next });
  return <div className="exhibition-form-wrap">
    {onSearchAi && <section className="ai-fill-bar"><div><Sparkles /><span><b>Search & Fill with AI</b><small>Enter the exhibition name, then fill only the fields you have left empty.</small></span></div><button type="button" className="button primary" disabled={aiState === "loading" || value.name.trim().length < 2} onClick={onSearchAi}>{aiState === "loading" ? "Searching…" : <><Sparkles /> Search & Fill with AI</>}</button>{aiMessage && <p className={aiState === "error" ? "error" : ""} role="status">{aiMessage}</p>}</section>}
    <div className="edit-form">
      <section className="form-section span-2"><header><FileText /><span><b>Basic Information</b><small>Core details about the exhibition</small></span></header><div className="form-section-grid">
        <TextField value={value} onChange={onChange} errors={errors} aiFilled={aiFilled} name="name" label="Exhibition name" required placeholder="e.g. Gastech 2026" />
        <TextField value={value} onChange={onChange} errors={errors} aiFilled={aiFilled} name="tagline" label="Short description" placeholder="A brief overview of the exhibition…" />
        <TextField value={value} onChange={onChange} errors={errors} aiFilled={aiFilled} name="industry" label="Industry / category" placeholder="Energy" />
        <TextField value={value} onChange={onChange} errors={errors} aiFilled={aiFilled} name="eventType" label="Event type" placeholder="International Exhibition" />
      </div></section>
      <section className="form-section span-2"><header><CalendarDays /><span><b>Date & Location</b><small>When and where the exhibition takes place</small></span></header><div className="form-section-grid three-cols">
        <DateButton label="Start date" value={value.startDate} required error={errors.startDate} onClick={() => setDateOpen(true)} />
        <DateButton label="End date" value={value.endDate} error={errors.endDate} onClick={() => setDateOpen(true)} />
        <label className="field"><span>Timezone</span><input list="timezones" value={value.timezone} onChange={(event) => set("timezone", event.target.value)} placeholder="e.g. Asia/Tehran" /><datalist id="timezones"><option value="Asia/Tehran" /><option value="Asia/Dubai" /><option value="Asia/Singapore" /><option value="Europe/Berlin" /><option value="UTC" /></datalist></label>
        <TextField value={value} onChange={onChange} errors={errors} aiFilled={aiFilled} name="country" label="Country" required placeholder="Select or enter country" />
        <TextField value={value} onChange={onChange} errors={errors} aiFilled={aiFilled} name="city" label="City" placeholder="Select or enter city" />
        <TextField value={value} onChange={onChange} errors={errors} aiFilled={aiFilled} name="venue" label="Venue" placeholder="e.g. Singapore EXPO" />
        <label className="field span-3"><span>Address</span><div className="input-with-icon"><MapPin /><input value={value.address} onChange={(event) => set("address", event.target.value)} placeholder="Street address or venue location" /></div></label>
      </div></section>
      <section className="form-section span-2"><header><Network /><span><b>Organizer & Links</b><small>Organizer details and official resources</small></span></header><div className="form-section-grid">
        <TextField value={value} onChange={onChange} errors={errors} aiFilled={aiFilled} name="organizer" label="Organizer" placeholder="e.g. DMG Events" />
        <TextField value={value} onChange={onChange} errors={errors} aiFilled={aiFilled} name="website" label="Official website" type="url" placeholder="https://www.example.com" />
      </div></section>
      <section className="form-section span-2"><header><Tag /><span><b>Topics & Description</b><small>Additional exhibition information</small></span></header><div className="form-section-grid">
        <label className="field"><span>Topics <small>(comma separated)</small></span><div className="input-with-icon"><Tag /><input value={value.topics.join(", ")} onChange={(event) => set("topics", event.target.value.split(",").map((part) => part.trim()).filter(Boolean))} placeholder="LNG, Natural Gas, Energy Transition" /></div></label>
        <label className={`field ${aiFilled.has("description") ? "ai-filled" : ""}`}><span>Description{aiFilled.has("description") && <small>Filled by AI</small>}</span><textarea rows={3} maxLength={1000} value={value.description} onChange={(event) => set("description", event.target.value)} placeholder="Enter a detailed description of the exhibition…" /><small className="char-count">{value.description.length}/1000</small></label>
        <label className="field span-2"><span>AI exhibition report</span><textarea rows={4} value={value.aiReport} onChange={(event) => set("aiReport", event.target.value)} placeholder="Optional research notes and report" /></label>
      </div></section>
    </div>
    {dateOpen && <DateRangeDialog startDate={value.startDate} endDate={value.endDate} onClose={() => setDateOpen(false)} onApply={(start, end) => { onChange({ ...value, startDate: start, endDate: end }); setDateOpen(false); }} />}
  </div>;
}
