"use client";

import { Bookmark, CalendarDays, MapPin } from "lucide-react";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { Exhibition } from "@/lib/exhibitions/types";
import { formatEventDate } from "@/lib/exhibitions/dates";

export function SavedClient() {
  const [items, setItems] = useState<Exhibition[] | null>(null);
  useEffect(() => { fetch("/api/exhibitions/saved").then((r) => r.json()).then(setItems); }, []);
  if (!items) return <div className="loading-grid"><i /><i /><i /></div>;
  if (!items.length) return <div className="empty-state saved-empty"><Bookmark /><h3>No saved exhibitions yet</h3><p>Save an exhibition from the list or detail page to build your shortlist.</p><Link className="button primary" href="/exhibitions">Explore Exhibitions</Link></div>;
  return <div className="saved-grid">{items.map((item) => <article className="saved-card panel" key={item.id}><div className="saved-card-top"><span>{item.industry}</span><Bookmark /></div><h2><Link href={`/exhibitions/${item.slug}`}>{item.name}</Link></h2><p>{item.tagline}</p><div><span><MapPin />{item.city}, {item.country}</span><span><CalendarDays />{formatEventDate(item.startDate, item.endDate)}</span></div><Link className="button outline" href={`/exhibitions/${item.slug}`}>View Exhibition →</Link></article>)}</div>;
}
