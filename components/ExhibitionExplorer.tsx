"use client";

import { Bookmark, Building2, CalendarDays, ChevronLeft, ChevronRight, EllipsisVertical, Filter, Heart, MapPin, Search, SlidersHorizontal, Trash2 } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useEffect, useState } from "react";
import { formatEventDate, formatPersianEventDate, getEventStatus } from "@/lib/exhibitions/dates";
import type { Exhibition, ExhibitionListResult, StatusKey } from "@/lib/exhibitions/types";
import { Modal } from "./Modal";
import { ReviewModal } from "./ReviewModal";

export function ExhibitionExplorer({ result, canUpdate, canDelete }: { result: ExhibitionListResult; canUpdate: boolean; canDelete: boolean }) {
  const router = useRouter(); const pathname = usePathname(); const current = useSearchParams();
  const [search, setSearch] = useState(current.get("q") ?? "");
  const [filtersOpen, setFiltersOpen] = useState(false); const [menu, setMenu] = useState<string | null>(null);
  const [editing, setEditing] = useState<Exhibition | null>(null); const [deleting, setDeleting] = useState<Exhibition | null>(null); const [busy, setBusy] = useState(false);
  const [emailState, setEmailState] = useState<Record<string, { pre: boolean; post: boolean }>>(() => Object.fromEntries(result.items.map((item) => [item.id, { pre: Boolean(item.preEventEmailSent), post: Boolean(item.postEventEmailSent) }])));
  const [emailBusy, setEmailBusy] = useState(""); const [notice, setNotice] = useState("");
  const update = (changes: Record<string, string | null>, resetPage = true) => {
    const params = new URLSearchParams(current.toString());
    for (const [key, value] of Object.entries(changes)) { if (value) params.set(key, value); else params.delete(key); }
    if (resetPage) params.delete("page");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };
  useEffect(() => { const timer = setTimeout(() => { if (search !== (current.get("q") ?? "")) update({ q: search || null }); }, 350); return () => clearTimeout(timer); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);
  const active = [current.get("country") && ["country", current.get("country")!], current.get("industry") && ["industry", current.get("industry")!], current.get("year") && ["year", current.get("year")!], current.get("topic") && ["topic", current.get("topic")!]].filter(Boolean) as string[][];
  async function toggleSave(item: Exhibition) { await fetch(`/api/exhibitions/${item.id}/save`, { method: "POST" }); router.refresh(); }
  async function remove() { if (!deleting) return; setBusy(true); const response = await fetch(`/api/exhibitions/${deleting.id}`, { method: "DELETE" }); setBusy(false); if (response.ok) { setDeleting(null); router.refresh(); } }
  async function updateEmail(item: Exhibition, kind: "pre" | "post", sent: boolean) {
    const key = `${item.id}:${kind}`; setEmailBusy(key); setNotice("");
    try {
      const response = await fetch(`/api/exhibitions/${item.id}/follow-up`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, sent }) });
      const payload = await response.json(); if (!response.ok) throw new Error(payload.error || "Unable to update email status.");
      setEmailState((state) => ({ ...state, [item.id]: { ...(state[item.id] ?? { pre: false, post: false }), [kind]: sent } }));
      setNotice(`${kind === "pre" ? "Pre-event" : "Post-event"} email status updated`); window.setTimeout(() => setNotice(""), 2600);
    } catch (caught) { setNotice(caught instanceof Error ? caught.message : "Unable to update email status."); }
    finally { setEmailBusy(""); }
  }
  return <>
    <section className="list-toolbar">
      <div className="database-search"><Search /><input aria-label="Search exhibitions" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search exhibitions by name, industry, country, city..." /><kbd>⌘ K</kbd></div>
      <div className="filter-wrap"><button className={`button filter-button ${active.length ? "has-active" : ""}`} onClick={() => setFiltersOpen((value) => !value)}><SlidersHorizontal /> Filters {active.length > 0 && <b>{active.length}</b>}</button>{filtersOpen && <div className="filter-popover">
        <label>Country<select value={current.get("country") ?? ""} onChange={(e) => update({ country: e.target.value || null })}><option value="">All countries</option>{result.options.countries.map((v) => <option key={v}>{v}</option>)}</select></label>
        <label>Industry<select value={current.get("industry") ?? ""} onChange={(e) => update({ industry: e.target.value || null })}><option value="">All industries</option>{result.options.industries.map((v) => <option key={v}>{v}</option>)}</select></label>
        <label>Year<select value={current.get("year") ?? ""} onChange={(e) => update({ year: e.target.value || null })}><option value="">All years</option>{result.options.years.map((v) => <option key={v}>{v}</option>)}</select></label>
        <button onClick={() => { update({ country: null, industry: null, year: null, topic: null, status: null }); setFiltersOpen(false); }}>Clear filters</button>
      </div>}</div>
      <label className="sort-control"><span>Sort by</span><select value={current.get("sort") ?? "nearest"} onChange={(e) => update({ sort: e.target.value === "nearest" ? null : e.target.value })}><option value="nearest">Nearest First</option><option value="latest">Latest Date</option><option value="name">Name A–Z</option><option value="country">Country A–Z</option><option value="recent">Recently Added</option></select></label>
      <div className="status-tabs">{(["all", "upcoming", "ongoing", "past"] as StatusKey[]).map((status) => <button key={status} className={(current.get("status") ?? "all") === status ? "active" : ""} onClick={() => update({ status: status === "all" ? null : status })}>{status[0].toUpperCase() + status.slice(1)}</button>)}</div>
    </section>
    <div className="active-row"><div>{active.map(([key, value]) => <button key={key} className="active-chip" onClick={() => update({ [key]: null })}>{key[0].toUpperCase() + key.slice(1)}: {value} ×</button>)}{active.length > 0 && <button className="clear-link" onClick={() => update({ country: null, industry: null, year: null, topic: null })}>Clear all</button>}</div><span>Showing {result.total ? (result.page - 1) * result.pageSize + 1 : 0}–{Math.min(result.page * result.pageSize, result.total)} of {result.total} exhibitions</span></div>
    {notice && <div className="inline-notice" role="status">{notice}</div>}
    <section className="exhibition-table" aria-label="Exhibitions">
      <div className="table-head"><span>#</span><span>Exhibition</span><span>Industry</span><span>Location</span><span>Date</span><span>Status</span><span>Email follow-up</span><span>Actions</span></div>
      {result.items.length ? result.items.map((item, index) => { const status = getEventStatus(item.startDate, item.endDate, new Date(), item.timezone); return <article className="exhibition-row" key={item.id}>
        <span className="row-number">{String((result.page - 1) * result.pageSize + index + 1).padStart(2, "0")}</span>
        <div className="event-cell"><Link href={`/exhibitions/${item.slug}`}>{item.name}</Link><p>{item.tagline}</p><div className="mini-tags">{item.topics.slice(0, 3).map((topic) => <button key={topic} onClick={() => update({ topic })}>{topic}</button>)}{item.topics.length > 3 && <span>+{item.topics.length - 3}</span>}</div></div>
        <div className="info-cell"><Building2 /><span><b>{item.industry}</b><small>{item.topics[1] ?? "Exhibition"}</small></span></div>
        <div className="info-cell"><MapPin /><span><b>{item.city}{item.city && item.country ? ", " : ""}{item.country}</b><small>{item.venue || "Venue TBA"}</small></span></div>
        <div className="info-cell date-cell"><CalendarDays /><span><b>{formatEventDate(item.startDate, item.endDate)}</b><small dir="rtl" lang="fa">{formatPersianEventDate(item.startDate, item.endDate, false)}</small></span></div>
        <div className={`status-cell ${status.state}`}><i /><span><b>{status.label}</b><small>{status.detail}</small></span></div>
        <div className="followup-cell"><label title="Pre-event email sent"><input type="checkbox" aria-label="Pre-event email sent" disabled={!canUpdate || emailBusy === `${item.id}:pre`} checked={emailState[item.id]?.pre ?? Boolean(item.preEventEmailSent)} onChange={(event) => updateEmail(item, "pre", event.target.checked)} /><span>Pre Email</span></label><label title="Post-event email sent"><input type="checkbox" aria-label="Post-event email sent" disabled={!canUpdate || emailBusy === `${item.id}:post`} checked={emailState[item.id]?.post ?? Boolean(item.postEventEmailSent)} onChange={(event) => updateEmail(item, "post", event.target.checked)} /><span>Post Email</span></label></div>
        <div className="row-actions"><button onClick={() => toggleSave(item)} className={item.saved ? "saved" : ""} aria-label={item.saved ? "Remove from saved" : "Save exhibition"}>{item.saved ? <Bookmark /> : <Heart />}</button><Link className="button row-view" href={`/exhibitions/${item.slug}`}>View <ChevronRight /></Link>{(canUpdate || canDelete) && <div className="row-menu-wrap"><button aria-label="More actions" onClick={() => setMenu(menu === item.id ? null : item.id)}><EllipsisVertical /></button>{menu === item.id && <div className="row-menu"><Link href={`/exhibitions/${item.slug}`}>View Exhibition</Link>{canUpdate && <button onClick={() => { setEditing(item); setMenu(null); }}>Edit Exhibition</button>}{canDelete && <button className="danger" onClick={() => { setDeleting(item); setMenu(null); }}>Delete Exhibition</button>}</div>}</div>}</div>
      </article>; }) : <div className="empty-state"><Filter /><h3>No exhibitions found</h3><p>Try broadening your search or clearing the active filters.</p><button className="button outline" onClick={() => router.replace("/exhibitions")}>Clear filters</button></div>}
    </section>
    <nav className="pagination" aria-label="Exhibition pages"><label><select value={result.pageSize} onChange={(e) => update({ pageSize: e.target.value })}><option value="5">5 per page</option><option value="10">10 per page</option><option value="20">20 per page</option></select></label><div><button disabled={result.page <= 1} onClick={() => update({ page: String(result.page - 1) }, false)}><ChevronLeft /></button>{Array.from({ length: Math.min(result.pageCount, 5) }, (_, i) => i + 1).map((page) => <button key={page} className={result.page === page ? "active" : ""} onClick={() => update({ page: String(page) }, false)}>{page}</button>)}{result.pageCount > 5 && <span>… {result.pageCount}</span>}<button disabled={result.page >= result.pageCount} onClick={() => update({ page: String(result.page + 1) }, false)}><ChevronRight /></button></div><span>Page {result.page} of {result.pageCount}</span></nav>
    {editing && <ReviewModal initial={editing} mode="edit" onClose={() => setEditing(null)} onSaved={() => router.refresh()} />}
    {deleting && <Modal onClose={() => setDeleting(null)} label="Delete exhibition"><div className="delete-dialog"><div className="delete-icon"><Trash2 /></div><h2>Delete Exhibition?</h2><p>Are you sure you want to delete <strong>“{deleting.name}”</strong>?<br />This action cannot be undone.</p><div><button className="button outline" onClick={() => setDeleting(null)}>Cancel</button><button className="button destructive" disabled={busy} onClick={remove}>{busy ? "Deleting…" : "Delete Exhibition"}</button></div></div></Modal>}
  </>;
}
