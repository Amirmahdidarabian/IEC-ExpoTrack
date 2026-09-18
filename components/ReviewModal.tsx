"use client";

import { CalendarDays, Check, Clock3, Database, FileText, Globe2, MapPin, Pencil, Sparkles, X } from "lucide-react";
import { useMemo, useState } from "react";
import Link from "next/link";
import { formatEventDate, getDurationDays } from "@/lib/exhibitions/dates";
import type { Exhibition, ExhibitionInput } from "@/lib/exhibitions/types";
import { ExhibitionForm } from "./ExhibitionForm";
import { Modal } from "./Modal";

function formDate(value: string | null) { return value ? new Date(value).toISOString().slice(0, 16) : null; }

export function ReviewModal({ initial, onClose, mode = "review", onSaved }: { initial: ExhibitionInput | Exhibition; onClose: () => void; mode?: "review" | "manual" | "edit"; onSaved?: (item: Exhibition) => void }) {
  const normalized = useMemo(() => ({ ...initial, startDate: formDate(initial.startDate)!, endDate: formDate(initial.endDate), sources: initial.sources?.map((source) => ({ label: source.label, url: source.url, lastChecked: source.lastChecked, priority: source.priority })) ?? [] }), [initial]);
  const [draft, setDraft] = useState<ExhibitionInput>(normalized);
  const [editing, setEditing] = useState(mode !== "review");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [complete, setComplete] = useState<Exhibition | null>(null);
  async function save() {
    setError("");
    if (!draft.name.trim() || !draft.country.trim() || !draft.startDate) { setError("Name, country and start date are required."); return; }
    if (draft.endDate && new Date(draft.endDate) < new Date(draft.startDate)) { setError("End date must be on or after the start date."); return; }
    setSaving(true);
    try {
      const id = "id" in initial ? initial.id : null;
      const response = await fetch(id ? `/api/exhibitions/${id}` : "/api/exhibitions", { method: id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to save exhibition");
      setComplete(payload); onSaved?.(payload);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to save exhibition"); }
    finally { setSaving(false); }
  }
  if (complete) return <Modal onClose={onClose} label="Exhibition added"><div className="success-state"><div className="success-icon"><Check /></div><p className="eyebrow">Exhibition database updated</p><h2>{mode === "edit" ? "Changes saved" : "Exhibition added successfully"}</h2><p>{complete.name} is ready in your intelligence database.</p><div className="success-actions"><Link className="button primary" href={`/exhibitions/${complete.slug}`}>View Exhibition</Link><Link className="button outline" href="/exhibitions">Back to Exhibitions</Link></div></div></Modal>;
  return <Modal onClose={onClose} label={mode === "manual" ? "Add exhibition" : editing ? "Edit exhibition" : "Exhibition found"} className="review-modal">
    <div className="review-heading"><span className="spark-icon"><Sparkles /></span><div><h2>{mode === "manual" ? "Add Exhibition" : mode === "edit" ? "Edit Exhibition" : "Exhibition Found"}</h2><p>{editing ? "Review and update the structured exhibition information." : "Review the information below before adding this exhibition to your list."}</p></div></div>
    {editing ? <ExhibitionForm value={draft} onChange={setDraft} /> : <div className="review-grid">
      <section className="review-main"><h3>{draft.name}</h3><p className="review-tagline">{draft.tagline}</p><div className="tag-row">{draft.topics.slice(0, 5).map((topic) => <span className="tag" key={topic}>{topic}</span>)}</div><div className="review-facts">
        <div><CalendarDays /><span><small>Start Date</small><b>{formatEventDate(draft.startDate, draft.startDate, true)}</b></span></div>
        <div><CalendarDays /><span><small>End Date</small><b>{draft.endDate ? formatEventDate(draft.endDate, draft.endDate, true) : "Same day"}</b></span></div>
        <div><Clock3 /><span><small>Duration</small><b>{getDurationDays(draft.startDate, draft.endDate)} Days</b></span></div>
        <div className="wide"><MapPin /><span><small>Venue</small><b>{draft.venue || "Venue to be announced"}</b><i>{[draft.city, draft.country].filter(Boolean).join(", ")}</i></span></div>
        <div><span className="person-icon">♙</span><span><small>Organizer</small><b>{draft.organizer || "Not specified"}</b></span></div>
        <div className="wide"><Globe2 /><span><small>Official Website</small>{draft.website ? <a href={draft.website} target="_blank" rel="noopener noreferrer">{draft.website.replace(/^https?:\/\//, "")}</a> : <b>Not available</b>}</span></div>
      </div></section>
      <aside className="review-aside"><div><h4><FileText /> About the Exhibition</h4><p>{draft.description || "No overview is available yet."}</p></div><div className="source-summary"><h4><Database /> AI Sources</h4><p>Information extracted from trusted exhibition sources:</p><div className="source-pills">{draft.sources?.slice(0, 4).map((source) => <a key={source.url} href={source.url} target="_blank" rel="noopener noreferrer"><i />{source.label}</a>)}</div>{!draft.sources?.length && <span className="muted">No sources supplied</span>}</div></aside>
    </div>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="review-actions">{!editing && <button className="button reject" onClick={onClose}><X /> Reject Result</button>}<button className="button outline violet" onClick={() => editing ? (mode === "review" ? setEditing(false) : onClose()) : setEditing(true)}><Pencil /> {editing ? "Cancel" : "Edit Information"}</button><button className="button primary" disabled={saving} onClick={save}>{saving ? "Saving…" : editing ? "Save Changes" : "Confirm Exhibition →"}</button></div>
  </Modal>;
}
