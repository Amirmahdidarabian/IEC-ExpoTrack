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
  const [selected, setSelected] = useState<Set<string>>(() => new Set()); const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false); const [bulkBusy, setBulkBusy] = useState(false); const [bulkError, setBulkError] = useState("");
  const [emailState, setEmailState] = useState<Record<string, { pre: boolean; post: boolean }>>(() => Object.fromEntries(result.items.map((item) => [item.id, { pre: Boolean(item.preEventEmailSent), post: Boolean(item.postEventEmailSent) }])));
  const [exhibitorListState, setExhibitorListState] = useState<Record<string, boolean>>(() => Object.fromEntries(result.items.map((item) => [item.id, Boolean(item.exhibitorList)])));
  const [visitorMessagingState, setVisitorMessagingState] = useState<Record<string, boolean>>(() => Object.fromEntries(result.items.map((item) => [item.id, Boolean(item.visitorMessaging)])));
  const [emailBusy, setEmailBusy] = useState(""); const [notice, setNotice] = useState("");
  const [exhibitorListBusy, setExhibitorListBusy] = useState("");
  const [visitorMessagingBusy, setVisitorMessagingBusy] = useState("");
  const update = (changes: Record<string, string | null>, resetPage = true) => {
    setSelected(new Set());
    const params = new URLSearchParams(current.toString());
    for (const [key, value] of Object.entries(changes)) { if (value) params.set(key, value); else params.delete(key); }
    if (resetPage) params.delete("page");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };
  useEffect(() => { const timer = setTimeout(() => { if (search !== (current.get("q") ?? "")) update({ q: search || null }); }, 350); return () => clearTimeout(timer); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);
  const active = [current.get("country") && ["country", current.get("country")!], current.get("industry") && ["industry", current.get("industry")!], current.get("year") && ["year", current.get("year")!], current.get("topic") && ["topic", current.get("topic")!], current.get("visitorMessaging") && ["visitorMessaging", current.get("visitorMessaging")!]].filter(Boolean) as string[][];
  const selectedItems = result.items.filter((item) => selected.has(item.id)); const allVisibleSelected = result.items.length > 0 && result.items.every((item) => selected.has(item.id));
  function toggleSelection(id: string, checked: boolean) { setSelected((value) => { const next = new Set(value); if (checked) next.add(id); else next.delete(id); return next; }); }
  function toggleVisible(checked: boolean) { setSelected(checked ? new Set(result.items.map((item) => item.id)) : new Set()); }
  async function removeSelected() { if (!selectedItems.length) return; setBulkBusy(true); setBulkError(""); try { const response = await fetch("/api/exhibitions/bulk-delete", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: selectedItems.map((item) => item.id) }) }); const payload = await response.json(); if (!response.ok) throw new Error(payload.error || "Unable to delete selected exhibitions."); setSelected(new Set()); setBulkDeleteOpen(false); router.refresh(); } catch (caught) { setBulkError(caught instanceof Error ? caught.message : "Unable to delete selected exhibitions."); } finally { setBulkBusy(false); } }
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
  async function updateExhibitorList(item: Exhibition, available: boolean) {
    setExhibitorListBusy(item.id); setNotice("");
    try {
      const response = await fetch(`/api/exhibitions/${item.id}/exhibitor-list`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ available }) });
      const payload = await response.json(); if (!response.ok) throw new Error(payload.error || "Unable to update exhibitor list status.");
      setExhibitorListState((state) => ({ ...state, [item.id]: available }));
      setNotice("Exhibitor list status updated"); window.setTimeout(() => setNotice(""), 2600);
    } catch (caught) { setNotice(caught instanceof Error ? caught.message : "Unable to update exhibitor list status."); }
    finally { setExhibitorListBusy(""); }
  }
  async function updateVisitorMessaging(item: Exhibition, available: boolean) {
    setVisitorMessagingBusy(item.id); setNotice("");
    try {
      const response = await fetch(`/api/exhibitions/${item.id}/visitor-messaging`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ available }) });
      const payload = await response.json(); if (!response.ok) throw new Error(payload.error || "Unable to update networking application status.");
      setVisitorMessagingState((state) => ({ ...state, [item.id]: available }));
      if (current.get("visitorMessaging")) router.refresh();
      setNotice("Networking application status updated"); window.setTimeout(() => setNotice(""), 2600);
    } catch (caught) { setNotice(caught instanceof Error ? caught.message : "Unable to update networking application status."); }
    finally { setVisitorMessagingBusy(""); }
  }
  return <>
    <section className="list-toolbar">
      <div className="database-search"><Search /><input aria-label="Search exhibitions" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search exhibitions by name, industry, country, city..." /><kbd>⌘ K</kbd></div>
      <div className="filter-wrap"><button className={`button filter-button ${active.length ? "has-active" : ""}`} onClick={() => setFiltersOpen((value) => !value)}><SlidersHorizontal /> Filters {active.length > 0 && <b>{active.length}</b>}</button>{filtersOpen && <div className="filter-popover">
        <label>Country<select value={current.get("country") ?? ""} onChange={(e) => update({ country: e.target.value || null })}><option value="">All countries</option>{result.options.countries.map((v) => <option key={v}>{v}</option>)}</select></label>
        <label>Industry<select value={current.get("industry") ?? ""} onChange={(e) => update({ industry: e.target.value || null })}><option value="">All industries</option>{result.options.industries.map((v) => <option key={v}>{v}</option>)}</select></label>
        <label>Year<select value={current.get("year") ?? ""} onChange={(e) => update({ year: e.target.value || null })}><option value="">All years</option>{result.options.years.map((v) => <option key={v}>{v}</option>)}</select></label>
        <label>Networking Application<select value={current.get("visitorMessaging") ?? ""} onChange={(e) => update({ visitorMessaging: e.target.value || null })}><option value="">All exhibitions</option><option value="true">Available</option><option value="false">Not available</option></select></label>
        <button onClick={() => { update({ country: null, industry: null, year: null, topic: null, visitorMessaging: null, status: null }); setFiltersOpen(false); }}>Clear filters</button>
      </div>}</div>
      <label className="sort-control"><span>Sort by</span><select value={current.get("sort") ?? "nearest"} onChange={(e) => update({ sort: e.target.value === "nearest" ? null : e.target.value })}><option value="nearest">Nearest First</option><option value="latest">Latest Date</option><option value="name">Name A–Z</option><option value="country">Country A–Z</option><option value="recent">Recently Added</option></select></label>
      <div className="status-tabs">{(["all", "upcoming", "ongoing", "past"] as StatusKey[]).map((status) => <button key={status} className={(current.get("status") ?? "all") === status ? "active" : ""} onClick={() => update({ status: status === "all" ? null : status })}>{status[0].toUpperCase() + status.slice(1)}</button>)}</div>
    </section>
    <div className="active-row"><div>{active.map(([key, value]) => <button key={key} className="active-chip" onClick={() => update({ [key]: null })}>{key === "visitorMessaging" ? "Networking Application" : key[0].toUpperCase() + key.slice(1)}: {key === "visitorMessaging" ? value === "true" ? "Available" : "Not available" : value} ×</button>)}{active.length > 0 && <button className="clear-link" onClick={() => update({ country: null, industry: null, year: null, topic: null, visitorMessaging: null })}>Clear all</button>}</div><span>Showing {result.total ? (result.page - 1) * result.pageSize + 1 : 0}–{Math.min(result.page * result.pageSize, result.total)} of {result.total} exhibitions</span></div>
    {notice && <div className="inline-notice" role="status">{notice}</div>}
    {canDelete && selectedItems.length > 0 && <div className="bulk-selection-bar" role="status"><span><b>{selectedItems.length}</b> exhibition{selectedItems.length === 1 ? "" : "s"} selected</span><div><button className="button outline" onClick={() => setSelected(new Set())}>Clear selection</button><button className="button destructive" onClick={() => { setBulkError(""); setBulkDeleteOpen(true); }}><Trash2 /> Delete selected</button></div></div>}
    <section className="exhibition-table" aria-label="Exhibitions">
      <div className="table-head"><div className="selection-cell">{canDelete && <input className="selection-checkbox" type="checkbox" aria-label="Select all visible exhibitions" checked={allVisibleSelected} onChange={(event) => toggleVisible(event.target.checked)} />}<b>#</b></div><span>Exhibition</span><span>Industry</span><span>Location</span><span>Date</span><span>Status</span><span>Email follow-up</span><span>Exhibitor list</span><span>Networking Application</span><span>Actions</span></div>
      {result.items.length ? result.items.map((item, index) => { const status = getEventStatus(item.startDate, item.endDate, new Date(), item.timezone); return <article className={`exhibition-row ${selected.has(item.id) ? "bulk-selected" : ""}`} key={item.id}>
        <div className="selection-cell">{canDelete && <input className="selection-checkbox" type="checkbox" aria-label={`Select ${item.name}`} checked={selected.has(item.id)} onChange={(event) => toggleSelection(item.id, event.target.checked)} />}<span className="row-number">{String((result.page - 1) * result.pageSize + index + 1).padStart(2, "0")}</span></div>
        <div className="event-cell"><Link href={`/exhibitions/${item.slug}`}>{item.name}</Link><p>{item.tagline}</p><div className="mini-tags">{item.topics.slice(0, 3).map((topic) => <button key={topic} onClick={() => update({ topic })}>{topic}</button>)}{item.topics.length > 3 && <span>+{item.topics.length - 3}</span>}</div></div>
        <div className="info-cell"><Building2 /><span><b>{item.industry}</b><small>{item.topics[1] ?? "Exhibition"}</small></span></div>
        <div className="info-cell"><MapPin /><span><b>{item.city}{item.city && item.country ? ", " : ""}{item.country}</b><small>{item.venue || "Venue TBA"}</small></span></div>
        <div className="info-cell date-cell"><CalendarDays /><span><b>{formatEventDate(item.startDate, item.endDate)}</b><small dir="rtl" lang="fa">{formatPersianEventDate(item.startDate, item.endDate, false)}</small></span></div>
        <div className={`status-cell ${status.state}`}><i /><span><b>{status.label}</b><small>{status.detail}</small></span></div>
        <div className="followup-cell"><label title="Pre-event email sent"><input type="checkbox" aria-label="Pre-event email sent" disabled={!canUpdate || emailBusy === `${item.id}:pre`} checked={emailState[item.id]?.pre ?? Boolean(item.preEventEmailSent)} onChange={(event) => updateEmail(item, "pre", event.target.checked)} /><span>Pre Email</span></label><label title="Post-event email sent"><input type="checkbox" aria-label="Post-event email sent" disabled={!canUpdate || emailBusy === `${item.id}:post`} checked={emailState[item.id]?.post ?? Boolean(item.postEventEmailSent)} onChange={(event) => updateEmail(item, "post", event.target.checked)} /><span>Post Email</span></label></div>
        <div className="exhibitor-list-cell"><input type="checkbox" aria-label="Exhibitor list available" title="Exhibitor list available" disabled={!canUpdate || exhibitorListBusy === item.id} checked={exhibitorListState[item.id] ?? Boolean(item.exhibitorList)} onChange={(event) => updateExhibitorList(item, event.target.checked)} /></div>
        <div className="visitor-messaging-cell"><input type="checkbox" aria-label="Networking application available" title="Networking application available" disabled={!canUpdate || visitorMessagingBusy === item.id} checked={visitorMessagingState[item.id] ?? Boolean(item.visitorMessaging)} onChange={(event) => updateVisitorMessaging(item, event.target.checked)} /></div>
        <div className="row-actions"><button onClick={() => toggleSave(item)} className={item.saved ? "saved" : ""} aria-label={item.saved ? "Remove from saved" : "Save exhibition"}>{item.saved ? <Bookmark /> : <Heart />}</button><Link className="button row-view" href={`/exhibitions/${item.slug}`}>View <ChevronRight /></Link>{(canUpdate || canDelete) && <div className="row-menu-wrap"><button aria-label="More actions" onClick={() => setMenu(menu === item.id ? null : item.id)}><EllipsisVertical /></button>{menu === item.id && <div className="row-menu"><Link href={`/exhibitions/${item.slug}`}>View Exhibition</Link>{canUpdate && <button onClick={() => { setEditing(item); setMenu(null); }}>Edit Exhibition</button>}{canDelete && <button className="danger" onClick={() => { setDeleting(item); setMenu(null); }}>Delete Exhibition</button>}</div>}</div>}</div>
      </article>; }) : <div className="empty-state"><Filter /><h3>No exhibitions found</h3><p>Try broadening your search or clearing the active filters.</p><button className="button outline" onClick={() => router.replace("/exhibitions")}>Clear filters</button></div>}
    </section>
    <nav className="pagination" aria-label="Exhibition pages"><label><select value={result.pageSize} onChange={(e) => update({ pageSize: e.target.value })}><option value="50">50 per page</option><option value="100">100 per page</option><option value="200">200 per page</option></select></label><div><button disabled={result.page <= 1} onClick={() => update({ page: String(result.page - 1) }, false)}><ChevronLeft /></button>{Array.from({ length: Math.min(result.pageCount, 5) }, (_, i) => i + 1).map((page) => <button key={page} className={result.page === page ? "active" : ""} onClick={() => update({ page: String(page) }, false)}>{page}</button>)}{result.pageCount > 5 && <span>… {result.pageCount}</span>}<button disabled={result.page >= result.pageCount} onClick={() => update({ page: String(result.page + 1) }, false)}><ChevronRight /></button></div><span>Page {result.page} of {result.pageCount}</span></nav>
    {editing && <ReviewModal initial={editing} mode="edit" onClose={() => setEditing(null)} onSaved={() => router.refresh()} />}
    {deleting && <Modal onClose={() => setDeleting(null)} label="Delete exhibition"><div className="delete-dialog"><div className="delete-icon"><Trash2 /></div><h2>Delete Exhibition?</h2><p>Are you sure you want to delete <strong>“{deleting.name}”</strong>?<br />This action cannot be undone.</p><div><button className="button outline" onClick={() => setDeleting(null)}>Cancel</button><button className="button destructive" disabled={busy} onClick={remove}>{busy ? "Deleting…" : "Delete Exhibition"}</button></div></div></Modal>}
    {bulkDeleteOpen && <Modal onClose={() => !bulkBusy && setBulkDeleteOpen(false)} label="Delete selected exhibitions"><div className="delete-dialog bulk-delete-dialog"><div className="delete-icon"><Trash2 /></div><h2>Delete {selectedItems.length} selected exhibition{selectedItems.length === 1 ? "" : "s"}?</h2><p>This permanently removes the selected exhibitions. The operation stops if any exhibition is still linked to a company.</p><ul>{selectedItems.slice(0, 5).map((item) => <li key={item.id}>{item.name}</li>)}{selectedItems.length > 5 && <li>and {selectedItems.length - 5} more…</li>}</ul>{bulkError && <p className="form-error" role="alert">{bulkError}</p>}<div><button className="button outline" disabled={bulkBusy} onClick={() => setBulkDeleteOpen(false)}>Cancel</button><button className="button destructive" disabled={bulkBusy} onClick={removeSelected}>{bulkBusy ? "Deleting…" : `Delete ${selectedItems.length} exhibitions`}</button></div></div></Modal>}
  </>;
}
