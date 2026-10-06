"use client";

import { Bookmark, Building2, CalendarDays, MapPin } from "lucide-react";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { Exhibition } from "@/lib/exhibitions/types";
import { formatEventDate } from "@/lib/exhibitions/dates";

type SavedCompany = { id: string; name: string; domain: string | null; country: string | null; priorityScore: number | null };

export function SavedClient() {
  const [items, setItems] = useState<Exhibition[] | null>(null); const [companies, setCompanies] = useState<SavedCompany[] | null>(null);
  useEffect(() => { Promise.all([fetch("/api/exhibitions/saved").then((response) => response.ok ? response.json() : []), fetch("/api/companies/saved").then((response) => response.ok ? response.json() : [])]).then(([events, organizations]) => { setItems(events); setCompanies(organizations); }); }, []);
  if (!items || !companies) return <div className="loading-grid"><i /><i /><i /></div>;
  if (!items.length && !companies.length) return <div className="empty-state saved-empty"><Bookmark /><h3>No saved intelligence yet</h3><p>Save an exhibition or company to build your shortlist.</p><Link className="button primary" href="/exhibitions">Explore Exhibitions</Link></div>;
  return <>{items.length > 0 && <div className="saved-grid">{items.map((item) => <article className="saved-card panel" key={item.id}><div className="saved-card-top"><span>{item.industry}</span><Bookmark /></div><h2><Link href={`/exhibitions/${item.slug}`}>{item.name}</Link></h2><p>{item.tagline}</p><div><span><MapPin />{item.city}, {item.country}</span><span><CalendarDays />{formatEventDate(item.startDate, item.endDate)}</span></div><Link className="button outline" href={`/exhibitions/${item.slug}`}>View Exhibition →</Link></article>)}</div>}{companies.length > 0 && <section className="saved-companies"><h2>Saved Companies</h2><div className="saved-grid">{companies.map((company) => <article className="saved-card panel" key={company.id}><div className="saved-card-top"><span>Company</span><Building2 /></div><h2><Link href={`/companies?company=${company.id}`}>{company.name}</Link></h2><p>{company.domain ?? "No website"}</p><div><span><MapPin />{company.country ?? "Country not set"}</span><span>Priority {company.priorityScore ?? "not set"}</span></div><Link className="button outline" href={`/companies?company=${company.id}`}>View Company →</Link></article>)}</div></section>}</>;
}
