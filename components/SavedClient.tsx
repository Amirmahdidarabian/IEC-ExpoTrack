"use client";

import { Bookmark, Building2, CalendarDays, MapPin } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import type { Exhibition } from "@/lib/exhibitions/types";
import { formatEventDate, getEventStatus } from "@/lib/exhibitions/dates";
import { loadSavedItems } from "@/lib/client/saved";

type SavedCompany = { id: string; name: string; domain: string | null; country: string | null; priorityScore: number | null };

function useSavedItems<T>(url: string | null) {
  const [state, setState] = useState<{ items: T[] | null; error: string }>({ items: null, error: "" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!url) return;
    const controller = new AbortController();
    loadSavedItems<T>(url, controller.signal).then((items) => {
      if (!controller.signal.aborted) setState({ items, error: "" });
    }).catch((error) => {
      if (!controller.signal.aborted) setState({ items: null, error: error instanceof Error ? error.message : "Unable to load saved items." });
    });
    return () => controller.abort();
  }, [url, attempt]);
  return { ...state, retry: () => { setState({ items: null, error: "" }); setAttempt((value) => value + 1); } };
}

function SavedSection({ title, items, error, retry, children }: { title: string; items: unknown[] | null; error: string; retry: () => void; children: ReactNode }) {
  return <section className="saved-section" aria-label={title}>
    <h2>{title}{items && <span>{items.length}</span>}</h2>
    {error ? <div className="empty-state saved-section-error"><h3>{title} could not be loaded</h3><p role="alert">{error}</p><button className="button outline" onClick={retry}>Try again</button></div>
      : !items ? <div className="loading-grid" role="status" aria-label={`Loading ${title.toLowerCase()}`}><i /><i /><i /><span className="sr-only">Loading {title.toLowerCase()}…</span></div>
      : !items.length ? <div className="empty-state saved-section-empty"><Bookmark /><h3>No {title.toLowerCase()} yet</h3><p>Use the save button to add items to your shortlist.</p></div>
      : <div className="saved-grid">{children}</div>}
  </section>;
}

export function SavedClient({ canViewExhibitions, canViewCompanies }: { canViewExhibitions: boolean; canViewCompanies: boolean }) {
  const exhibitions = useSavedItems<Exhibition>(canViewExhibitions ? "/api/exhibitions/saved" : null);
  const companies = useSavedItems<SavedCompany>(canViewCompanies ? "/api/companies/saved" : null);
  if (!canViewExhibitions && !canViewCompanies) return <div className="empty-state saved-empty"><Bookmark /><h3>No saved collections available</h3><p>Your account needs access to exhibitions or companies to view saved items.</p></div>;
  return <div className="saved-collections">
    {canViewExhibitions && <SavedSection title="Saved Exhibitions" {...exhibitions}>{exhibitions.items?.map((item) => {
      const status = getEventStatus(item.startDate, item.endDate, new Date(), item.timezone);
      return <article className="saved-card panel" key={item.id}><div className="saved-card-top"><span>{item.industry}</span><Bookmark aria-hidden="true" /></div><h3><Link href={`/exhibitions/${item.slug}`}>{item.name}</Link></h3><p>{item.tagline}</p><div className="saved-card-meta"><span><MapPin aria-hidden="true" />{item.city}{item.city && item.country ? ", " : ""}{item.country}</span><span><CalendarDays aria-hidden="true" />{formatEventDate(item.startDate, item.endDate)}</span><span className={`saved-event-status ${status.state}`}>{status.label} · {status.detail}</span></div><Link className="button outline" href={`/exhibitions/${item.slug}`}>View Exhibition →</Link></article>;
    })}</SavedSection>}
    {canViewCompanies && <SavedSection title="Saved Companies" {...companies}>{companies.items?.map((company) => <article className="saved-card panel" key={company.id}><div className="saved-card-top"><span>Company</span><Building2 aria-hidden="true" /></div><h3><Link href={`/companies?company=${company.id}`}>{company.name}</Link></h3><p>{company.domain ?? "No website"}</p><div className="saved-card-meta"><span><MapPin aria-hidden="true" />{company.country ?? "Country not set"}</span><span>Priority {company.priorityScore ?? "not set"}</span></div><Link className="button outline" href={`/companies?company=${company.id}`}>View Company →</Link></article>)}</SavedSection>}
  </div>;
}
