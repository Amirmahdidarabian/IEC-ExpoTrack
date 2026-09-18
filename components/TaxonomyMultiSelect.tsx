"use client";

import { Check, LoaderCircle, Pencil, Plus, Search, Tag, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { TaxonomyItem } from "@/lib/exhibitions/types";
import type { TaxonomyKind } from "@/lib/exhibitions/taxonomy";
import { Modal } from "./Modal";
import { SearchableCombobox } from "./SearchableCombobox";

type Props = {
  kind: TaxonomyKind;
  label: string;
  value: string[];
  onChange: (ids: string[]) => void;
  error?: string;
};

export function TaxonomyMultiSelect({ kind, label, value, onChange, error = "" }: Props) {
  const [items, setItems] = useState<TaxonomyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [manageOpen, setManageOpen] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/taxonomies/${kind}`, { signal: controller.signal }).then(async (response) => {
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to load options.");
      setItems(payload);
    }).catch((caught) => { if (caught instanceof Error && caught.name !== "AbortError") setLoadError(caught.message); }).finally(() => setLoading(false));
    return () => controller.abort();
  }, [kind]);
  const selected = value.flatMap((id) => { const item = items.find((entry) => entry.id === id); return item ? [item] : []; });
  const available = items.filter((item) => !value.includes(item.id)).map((item) => ({ value: item.id, label: item.name }));

  return <div className="field taxonomy-field">
    <span>{label}{kind === "categories" && " *"}</span>
    <div className="taxonomy-control">
      <div className="taxonomy-chips">{selected.map((item) => <span className="selection-chip" key={item.id}>{item.name}<button type="button" aria-label={`Remove ${item.name}`} onClick={() => onChange(value.filter((id) => id !== item.id))}><X /></button></span>)}</div>
      <div className="taxonomy-search"><SearchableCombobox ariaLabel={`Search ${label}`} value="" options={available} onChange={(option) => { if (option) onChange([...value, option.value]); }} loading={loading} error={loadError} placeholder={`Search ${label.toLowerCase()}…`} emptyText={`No ${label.toLowerCase()} available`} /><button type="button" className="manage-taxonomy" aria-label={`Manage ${label}`} title={`Manage ${label}`} onClick={() => setManageOpen(true)}><Plus /></button></div>
    </div>
    {error && <em>{error}</em>}
    {manageOpen && <ManageTaxonomyModal kind={kind} label={label} items={items} onClose={() => setManageOpen(false)} onChanged={(next, removedId) => { setItems(next); if (removedId && value.includes(removedId)) onChange(value.filter((id) => id !== removedId)); }} />}
  </div>;
}

function ManageTaxonomyModal({ kind, label, items, onClose, onChanged }: { kind: TaxonomyKind; label: string; items: TaxonomyItem[]; onClose: () => void; onChanged: (items: TaxonomyItem[], removedId?: string) => void }) {
  const [query, setQuery] = useState("");
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState("");
  const [editingName, setEditingName] = useState("");
  const [deleting, setDeleting] = useState<TaxonomyItem | null>(null);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const filtered = useMemo(() => items.filter((item) => item.name.toLocaleLowerCase("en-US").includes(query.trim().toLocaleLowerCase("en-US"))), [items, query]);

  async function mutate(url: string, method: "POST" | "PATCH" | "DELETE", name?: string) {
    setBusy(`${method}:${url}`); setMessage("");
    try {
      const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: name === undefined ? undefined : JSON.stringify({ name }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "The change could not be saved.");
      if (method === "POST") { onChanged([...items, payload].sort((a, b) => a.name.localeCompare(b.name))); setNewName(""); }
      if (method === "PATCH") { onChanged(items.map((item) => item.id === payload.id ? { ...item, ...payload } : item).sort((a, b) => a.name.localeCompare(b.name))); setEditingId(""); }
      if (method === "DELETE" && deleting) { onChanged(items.filter((item) => item.id !== deleting.id), deleting.id); setDeleting(null); }
      setMessage(method === "DELETE" ? "Item deleted." : "Changes saved.");
    } catch (caught) { setMessage(caught instanceof Error ? caught.message : "The change could not be saved."); }
    finally { setBusy(""); }
  }

  return <Modal onClose={onClose} label={`Manage ${label}`} className="taxonomy-modal">
    <header className="taxonomy-modal-heading"><Tag /><div><h2>Manage {label}</h2><p>Add, rename, or remove database-driven options.</p></div></header>
    <form className="taxonomy-add" onSubmit={(event) => { event.preventDefault(); if (newName.trim()) void mutate(`/api/taxonomies/${kind}`, "POST", newName); }}><input value={newName} maxLength={80} onChange={(event) => setNewName(event.target.value)} placeholder={`New ${kind === "categories" ? "category" : "topic"} name`} /><button className="button primary" disabled={!newName.trim() || Boolean(busy)}><Plus /> Add</button></form>
    <label className="taxonomy-filter"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${label.toLowerCase()}`} /></label>
    <div className="taxonomy-list">{!filtered.length ? <p className="combo-state">No matching items.</p> : filtered.map((item) => <div key={item.id}>
      {editingId === item.id ? <form onSubmit={(event) => { event.preventDefault(); if (editingName.trim()) void mutate(`/api/taxonomies/${kind}/${item.id}`, "PATCH", editingName); }}><input autoFocus value={editingName} onChange={(event) => setEditingName(event.target.value)} /><button aria-label="Save name" disabled={Boolean(busy)}><Check /></button><button type="button" aria-label="Cancel rename" onClick={() => setEditingId("")}><X /></button></form> : <><span><b>{item.name}</b><small>{item.usageCount ?? 0} exhibition{item.usageCount === 1 ? "" : "s"}</small></span><button type="button" aria-label={`Rename ${item.name}`} onClick={() => { setEditingId(item.id); setEditingName(item.name); setMessage(""); }}><Pencil /></button><button type="button" className="danger" aria-label={`Delete ${item.name}`} onClick={() => { setDeleting(item); setMessage(""); }}><Trash2 /></button></>}
    </div>)}</div>
    {deleting && <div className="taxonomy-confirm" role="alertdialog" aria-label="Confirm deletion"><p>Delete <strong>{deleting.name}</strong>?</p><span>This is allowed only when no exhibition uses it.</span><div><button className="button outline" type="button" onClick={() => setDeleting(null)}>Cancel</button><button className="button destructive" type="button" disabled={Boolean(busy)} onClick={() => void mutate(`/api/taxonomies/${kind}/${deleting.id}`, "DELETE")}>{busy ? <LoaderCircle /> : <Trash2 />} Delete</button></div></div>}
    {message && <p className={message.includes("cannot") || message.includes("could not") || message.includes("exists") ? "form-error" : "form-success"} role="status">{message}</p>}
  </Modal>;
}
