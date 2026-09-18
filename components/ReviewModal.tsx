"use client";

import { CalendarDays, Check, Clock3, Database, FileText, Globe2, MapPin, Pencil, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { formatEventDate, formatPersianEventDate, getDurationDays } from "@/lib/exhibitions/dates";
import { exhibitionSchema } from "@/lib/exhibitions/schema";
import type { Exhibition, ExhibitionInput } from "@/lib/exhibitions/types";
import { DuplicateExhibitionDialog } from "./DuplicateExhibitionDialog";
import { ExhibitionForm } from "./ExhibitionForm";
import { Modal } from "./Modal";

type AiState = "idle" | "loading" | "error" | "success";

function withoutIds(initial: ExhibitionInput | Exhibition): ExhibitionInput {
  return { name: initial.name, tagline: initial.tagline, industry: initial.industry, eventType: initial.eventType, country: initial.country, city: initial.city, venue: initial.venue, address: initial.address, startDate: initial.startDate, endDate: initial.endDate, timezone: initial.timezone, organizer: initial.organizer, website: initial.website, description: initial.description, aiReport: initial.aiReport, topics: [...initial.topics], sources: initial.sources?.map((source) => ({ label: source.label, url: source.url, lastChecked: source.lastChecked, priority: source.priority })) ?? [] };
}

function isEmpty(value: unknown) { return value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0); }

export function ReviewModal({ initial, onClose, mode = "review", onSaved }: { initial: ExhibitionInput | Exhibition; onClose: () => void; mode?: "review" | "manual" | "edit"; onSaved?: (item: Exhibition) => void }) {
  const normalized = useMemo(() => withoutIds(initial), [initial]);
  const [draft, setDraft] = useState<ExhibitionInput>(normalized);
  const [editing, setEditing] = useState(mode !== "review");
  const [phase, setPhase] = useState<"idle" | "checking" | "saving">("idle");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [outcome, setOutcome] = useState<{ item: Exhibition; title: string } | null>(null);
  const [duplicate, setDuplicate] = useState<Exhibition | null>(null);
  const [duplicateError, setDuplicateError] = useState("");
  const [aiState, setAiState] = useState<AiState>("idle");
  const [aiMessage, setAiMessage] = useState("");
  const [aiFilled, setAiFilled] = useState<Set<string>>(new Set());
  const [addAnother, setAddAnother] = useState(false);
  const [toast, setToast] = useState("");

  function validate() {
    const result = exhibitionSchema.safeParse(draft);
    if (result.success) { setErrors({}); return true; }
    const next: Record<string, string> = {};
    for (const issue of result.error.issues) next[String(issue.path[0] ?? "form")] = issue.message;
    setErrors(next); setError("Please correct the highlighted fields."); return false;
  }

  async function searchWithAi() {
    if (draft.name.trim().length < 2) return;
    setAiState("loading"); setAiMessage(""); setError("");
    try {
      const response = await fetch("/api/exhibitions/search-ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: draft.name }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "AI research failed");
      const match = payload.matches?.[0] as Partial<ExhibitionInput> | undefined;
      if (!match) { setAiState("error"); setAiMessage("No trusted exhibition result was found. Continue entering the details manually."); return; }
      const next = { ...draft }; const filled = new Set<string>();
      for (const [key, incoming] of Object.entries(match)) {
        const field = key as keyof ExhibitionInput;
        if (isEmpty(next[field]) && !isEmpty(incoming)) { (next as Record<string, unknown>)[key] = incoming; filled.add(key); }
      }
      setDraft(next); setAiFilled(filled); setAiState("success"); setAiMessage(filled.size ? `${filled.size} empty fields were filled. Your existing values were preserved.` : "Your form already contains the available information; nothing was overwritten.");
    } catch (caught) { setAiState("error"); setAiMessage(caught instanceof Error ? caught.message : "AI research failed. Your form values are unchanged."); }
  }

  function finish(item: Exhibition, title = mode === "edit" ? "Exhibition updated successfully" : "Exhibition added successfully") {
    onSaved?.(item);
    if (addAnother && mode === "manual") { setDraft(normalized); setAiFilled(new Set()); setErrors({}); setError(""); setToast("Exhibition added successfully"); window.setTimeout(() => setToast(""), 3200); }
    else setOutcome({ item, title });
  }

  async function save(resolution?: "replace" | "keep-both") {
    setError(""); setDuplicateError("");
    if (!validate()) return;
    const id = "id" in initial ? initial.id : null;
    const isResolution = Boolean(resolution && duplicate);
    setPhase(isResolution ? "saving" : "checking");
    try {
      const endpoint = id && !isResolution ? `/api/exhibitions/${id}` : "/api/exhibitions";
      const body = isResolution ? { exhibition: draft, duplicateResolution: resolution, duplicateId: duplicate!.id } : draft;
      const response = await fetch(endpoint, { method: id && !isResolution ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const payload = await response.json();
      if (response.status === 409 && payload.code === "POSSIBLE_DUPLICATE" && payload.duplicates?.length) { setDuplicate(payload.duplicates[0]); return; }
      if (!response.ok) throw new Error(payload.error || "Unable to save exhibition");
      setDuplicate(null); finish(payload, resolution === "replace" || mode === "edit" ? "Exhibition updated successfully" : "Exhibition added successfully");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Unable to save exhibition";
      if (duplicate) setDuplicateError(message); else setError(message);
    } finally { setPhase("idle"); }
  }

  if (outcome) return <Modal onClose={onClose} label="Exhibition saved"><div className="success-state"><div className="success-icon"><Check /></div><p className="eyebrow">Exhibition database updated</p><h2>{outcome.title}</h2><p>{outcome.item.name} is ready in your intelligence database.</p><div className="success-actions"><Link className="button primary" href={`/exhibitions/${outcome.item.slug}`}>View Exhibition</Link><Link className="button outline" href="/exhibitions">Back to Exhibitions</Link></div></div></Modal>;

  return <><Modal onClose={onClose} label={mode === "manual" ? "Add exhibition" : editing ? "Edit exhibition" : "Exhibition found"} className="review-modal">
    {toast && <div className="toast" role="status"><Check /> {toast}</div>}
    <div className="review-heading"><span className="spark-icon"><Sparkles /></span><div><h2>{mode === "manual" ? "Add New Exhibition" : mode === "edit" ? "Edit Exhibition" : "Exhibition Found"}</h2><p>{editing ? "Enter the exhibition details manually or let AI fill the fields you leave empty." : "Review the information below before adding this exhibition to your list."}</p></div></div>
    {editing ? <ExhibitionForm value={draft} onChange={setDraft} errors={errors} onSearchAi={mode === "edit" ? undefined : searchWithAi} aiState={aiState} aiMessage={aiMessage} aiFilled={aiFilled} /> : <div className="review-grid">
      <section className="review-main"><h3>{draft.name}</h3><p className="review-tagline">{draft.tagline}</p><div className="tag-row">{draft.topics.slice(0, 5).map((topic) => <span className="tag" key={topic}>{topic}</span>)}</div><div className="review-facts">
        <div><CalendarDays /><span><small>Dates</small><b>{formatEventDate(draft.startDate, draft.endDate, true)}</b><i dir="rtl" lang="fa">{formatPersianEventDate(draft.startDate, draft.endDate)}</i></span></div>
        <div><Clock3 /><span><small>Duration</small><b>{getDurationDays(draft.startDate, draft.endDate)} Days</b></span></div>
        <div className="wide"><MapPin /><span><small>Venue</small><b>{draft.venue || "Venue to be announced"}</b><i>{[draft.city, draft.country].filter(Boolean).join(", ")}</i></span></div>
        <div><span className="person-icon">♙</span><span><small>Organizer</small><b>{draft.organizer || "Not specified"}</b></span></div>
        <div className="wide"><Globe2 /><span><small>Official Website</small>{draft.website ? <a href={draft.website} target="_blank" rel="noopener noreferrer">{draft.website.replace(/^https?:\/\//, "")}</a> : <b>Not available</b>}</span></div>
      </div></section>
      <aside className="review-aside"><div><h4><FileText /> About the Exhibition</h4><p>{draft.description || "No overview is available yet."}</p></div><div className="source-summary"><h4><Database /> AI Sources</h4><p>Information extracted from trusted exhibition sources:</p><div className="source-pills">{draft.sources?.slice(0, 4).map((source) => <a key={source.url} href={source.url} target="_blank" rel="noopener noreferrer"><i />{source.label}</a>)}</div>{!draft.sources?.length && <span className="muted">No sources supplied</span>}</div></aside>
    </div>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className={`review-actions ${editing ? "editing-actions" : ""}`}>{!editing && <button className="button reject" onClick={onClose}><X /> Reject Result</button>}{editing && <button className="button outline" onClick={() => mode === "review" ? setEditing(false) : onClose()}><X /> Cancel</button>}{editing && mode === "manual" && <label className="add-another"><input type="checkbox" checked={addAnother} onChange={(event) => setAddAnother(event.target.checked)} /> Save and add another exhibition</label>}{!editing && <button className="button outline violet" onClick={() => setEditing(true)}><Pencil /> Edit Information</button>}<button className="button primary" disabled={phase !== "idle"} onClick={() => save()}>{phase === "checking" ? "Checking for duplicates…" : phase === "saving" ? "Saving…" : mode === "edit" ? "Save Changes" : editing ? "Add Exhibition →" : "Confirm Exhibition →"}</button></div>
  </Modal>
  {duplicate && <DuplicateExhibitionDialog existing={duplicate} incoming={draft} busy={phase !== "idle"} error={duplicateError} onClose={() => setDuplicate(null)} onKeepExisting={() => finish(duplicate, "Existing exhibition kept")} onReplace={() => save("replace")} onKeepBoth={() => save("keep-both")} />}</>;
}
