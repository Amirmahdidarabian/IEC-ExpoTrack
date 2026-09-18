"use client";

import { AlertTriangle, ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { formatEventDate, formatPersianEventDate } from "@/lib/exhibitions/dates";
import type { Exhibition, ExhibitionInput } from "@/lib/exhibitions/types";
import { Modal } from "./Modal";

const fields = [["name", "Name"], ["industry", "Industry"], ["country", "Country"], ["city", "City"], ["venue", "Venue"], ["organizer", "Organizer"], ["website", "Website"]] as const;

function ComparisonCard({ title, value, other }: { title: string; value: Exhibition | ExhibitionInput; other: Exhibition | ExhibitionInput }) {
  return <article className="duplicate-card"><h3>{title}</h3><div className="duplicate-fields">{fields.map(([key, label]) => { const current = String(value[key] ?? "—"); const different = current.trim().toLowerCase() !== String(other[key] ?? "").trim().toLowerCase(); return <div key={key} className={different ? "different" : ""}><small>{label}</small><b>{current || "—"}</b></div>; })}<div className={value.startDate !== other.startDate || value.endDate !== other.endDate ? "different" : ""}><small>Dates</small><b>{formatEventDate(value.startDate, value.endDate)}</b><span dir="rtl" lang="fa">{formatPersianEventDate(value.startDate, value.endDate)}</span></div></div></article>;
}

export function DuplicateExhibitionDialog({ existing, incoming, busy, error, onKeepExisting, onReplace, onKeepBoth, onClose }: { existing: Exhibition; incoming: ExhibitionInput; busy: boolean; error?: string; onKeepExisting: () => void; onReplace: () => void; onKeepBoth: () => void; onClose: () => void }) {
  return <Modal onClose={onClose} label="Possible duplicate found" className="duplicate-modal" noClose={busy}><header className="duplicate-heading"><span><AlertTriangle /></span><div><h2>Possible Duplicate Found</h2><p>We found an exhibition that may match the one you&apos;re adding.</p></div></header><div className="duplicate-grid"><ComparisonCard title="Existing Exhibition" value={existing} other={incoming} /><ComparisonCard title="New Exhibition" value={incoming} other={existing} /></div><Link className="view-existing" href={`/exhibitions/${existing.slug}`} target="_blank">View existing exhibition <ArrowUpRight /></Link>{error && <p className="form-error" role="alert">{error}</p>}<footer className="duplicate-actions"><button className="button outline" disabled={busy} onClick={onKeepExisting}>Keep Existing</button><button className="button outline violet" disabled={busy} onClick={onReplace}>{busy ? "Updating…" : "Use New Information"}</button><button className="button primary" disabled={busy} onClick={onKeepBoth}>{busy ? "Saving…" : "Keep Both"}</button></footer></Modal>;
}
