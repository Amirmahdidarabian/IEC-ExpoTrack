"use client";

import type { ExhibitionInput } from "@/lib/exhibitions/types";

type TextFieldProps = { name: keyof ExhibitionInput; label: string; type?: string; required?: boolean; placeholder?: string; value: ExhibitionInput; onChange: (value: ExhibitionInput) => void; errors: Record<string, string> };

function TextField({ name, label, type = "text", required = false, placeholder = "", value, onChange, errors }: TextFieldProps) {
  return <label className="field"><span>{label}{required && " *"}</span><input type={type} required={required} placeholder={placeholder} value={(value[name] as string | null) ?? ""} onChange={(event) => onChange({ ...value, [name]: event.target.value || (name === "endDate" ? null : "") })} />{errors[name] && <em>{errors[name]}</em>}</label>;
}

export function ExhibitionForm({ value, onChange, errors = {} }: { value: ExhibitionInput; onChange: (value: ExhibitionInput) => void; errors?: Record<string, string> }) {
  const set = (key: keyof ExhibitionInput, next: string | string[] | null) => onChange({ ...value, [key]: next });
  return <div className="edit-form">
    <TextField value={value} onChange={onChange} errors={errors} name="name" label="Exhibition name" required />
    <TextField value={value} onChange={onChange} errors={errors} name="tagline" label="Short description" />
    <TextField value={value} onChange={onChange} errors={errors} name="industry" label="Industry / category" />
    <TextField value={value} onChange={onChange} errors={errors} name="eventType" label="Event type" />
    <TextField value={value} onChange={onChange} errors={errors} name="country" label="Country" required />
    <TextField value={value} onChange={onChange} errors={errors} name="city" label="City" />
    <TextField value={value} onChange={onChange} errors={errors} name="venue" label="Venue" />
    <TextField value={value} onChange={onChange} errors={errors} name="address" label="Address" />
    <TextField value={value} onChange={onChange} errors={errors} name="startDate" label="Start date" type="datetime-local" required />
    <TextField value={value} onChange={onChange} errors={errors} name="endDate" label="End date" type="datetime-local" />
    <TextField value={value} onChange={onChange} errors={errors} name="timezone" label="Timezone" placeholder="Europe/Berlin" />
    <TextField value={value} onChange={onChange} errors={errors} name="organizer" label="Organizer" />
    <TextField value={value} onChange={onChange} errors={errors} name="website" label="Website" type="url" />
    <label className="field span-2"><span>Topics <small>(comma separated)</small></span><input value={value.topics.join(", ")} onChange={(event) => set("topics", event.target.value.split(",").map((part) => part.trim()).filter(Boolean))} /></label>
    <label className="field span-2"><span>Description</span><textarea rows={4} value={value.description} onChange={(event) => set("description", event.target.value)} /></label>
    <label className="field span-2"><span>AI exhibition report</span><textarea rows={5} value={value.aiReport} onChange={(event) => set("aiReport", event.target.value)} /></label>
  </div>;
}
