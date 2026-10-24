"use client";

import { ArrowLeft, ArrowRight, Building2, Folder, FolderOpen, FolderPlus, Pencil, Plus, Search, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { Modal } from "@/components/Modal";
import { folderColors } from "@/lib/companies/folder-schema";

export type FolderOption = { id: string; name: string; color: string; description?: string; companyCount?: number };
export function CompanyFolderPicker({ folders, value, onChange }: { folders: FolderOption[]; value: string[]; onChange: (ids: string[]) => void }) {
  return <fieldset className="company-folder-picker"><legend>Company folders</legend><p>A company can belong to more than one folder.</p>{folders.length ? <div>{folders.map((folder) => <label key={folder.id}><input type="checkbox" checked={value.includes(folder.id)} onChange={(event) => onChange(event.target.checked ? [...new Set([...value, folder.id])] : value.filter((id) => id !== folder.id))} /><Folder className={`folder-color-${folder.color}`} /><span>{folder.name}</span></label>)}</div> : <p>No folders yet. Create one from the Companies folder list.</p>}</fieldset>;
}

export function CompanyFolderBreadcrumb({ name }: { name: string }) {
  return <nav className="company-folder-breadcrumb" aria-label="Company navigation"><Link href="/companies"><ArrowLeft /> Company folders</Link><span>/</span><strong>{name}</strong></nav>;
}

export function CompanyFolders({ folders, total, unfiled, canManage }: { folders: FolderOption[]; total: number; unfiled: number; canManage: boolean }) {
  const router = useRouter(); const [search, setSearch] = useState(""); const [editing, setEditing] = useState<FolderOption | "new" | null>(null);
  const [deleting, setDeleting] = useState<FolderOption | null>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const visible = folders.filter((folder) => `${folder.name} ${folder.description ?? ""}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  async function remove() {
    if (!deleting) return; setBusy(true); setError("");
    try { const response = await fetch(`/api/companies/folders/${deleting.id}`, { method: "DELETE" }); const body = await response.json(); if (!response.ok) throw new Error(body.error || "Unable to delete folder."); setDeleting(null); router.refresh(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to delete folder."); } finally { setBusy(false); }
  }
  return <section className="company-folder-browser" aria-label="Company folders">
    <div className="company-folder-intro"><div><h2>Your company folders</h2><p>Open a folder to view its companies. Companies can belong to several folders without duplicate records.</p></div><span>{folders.length} folders</span></div>
    <div className="company-folder-shortcuts"><Link href="/companies?folder=all"><Building2 /><span><strong>All companies</strong><small>Every company, listed once</small></span><b>{total.toLocaleString()}</b><ArrowRight /></Link><Link href="/companies?folder=unfiled"><FolderOpen /><span><strong>Without a folder</strong><small>Ready to organize</small></span><b>{unfiled.toLocaleString()}</b><ArrowRight /></Link></div>
    <label className="database-search company-folder-search"><Search /><input aria-label="Search folders" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find a company folder…" /></label>
    <div className="company-folder-list" role="list">{visible.map((folder) => <article className="company-folder-row" role="listitem" key={folder.id}><Link href={`/companies?folder=${encodeURIComponent(folder.id)}`} className="company-folder-link"><span className={`company-folder-icon folder-color-${folder.color}`}><Folder /></span><span className="company-folder-copy"><strong>{folder.name}</strong>{folder.description && <small>{folder.description}</small>}</span><span className="company-folder-count">{(folder.companyCount ?? 0).toLocaleString()}<small>companies</small></span><ArrowRight /></Link>{canManage && <div className="company-folder-actions"><button className="icon-button" aria-label={`Edit folder ${folder.name}`} onClick={() => setEditing(folder)}><Pencil /></button><button className="icon-button" aria-label={`Delete folder ${folder.name}`} onClick={() => { setError(""); setDeleting(folder); }}><Trash2 /></button></div>}</article>)}</div>
    {!visible.length && <div className="empty-state"><FolderOpen /><h3>{search ? "No matching folders" : "Start organizing your companies"}</h3><p>{search ? "Try another folder name." : "Create your first folder, then add existing companies or import an Excel workbook."}</p></div>}
    {canManage && <button className="company-folder-add" onClick={() => setEditing("new")}><Plus /><span>New company folder</span></button>}
    {editing && <FolderForm initial={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); router.refresh(); }} />}
    {deleting && <Modal label="Delete company folder" noClose={busy} onClose={() => setDeleting(null)}><div className="delete-dialog"><Trash2 /><h2>Delete “{deleting.name}”?</h2><p>Only this folder and its memberships will be removed. All companies, contacts and their other folders will remain.</p>{error && <p className="form-error" role="alert">{error}</p>}<div className="form-actions"><button className="button outline" disabled={busy} onClick={() => setDeleting(null)}>Cancel</button><button className="button destructive" disabled={busy} onClick={remove}>{busy ? "Deleting…" : "Delete folder only"}</button></div></div></Modal>}
  </section>;
}

function FolderForm({ initial, onClose, onSaved }: { initial?: FolderOption; onClose: () => void; onSaved: () => void }) {
  const [color, setColor] = useState(initial?.color ?? "cyan"); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); setBusy(true); setError("");
    try { const response = await fetch(initial ? `/api/companies/folders/${initial.id}` : "/api/companies/folders", { method: initial ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: form.get("name"), description: form.get("description"), color }) }); const body = await response.json(); if (!response.ok) throw new Error(body.error || "Unable to save folder."); onSaved(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to save folder."); } finally { setBusy(false); }
  }
  return <Modal label={initial ? "Edit company folder" : "Create company folder"} noClose={busy} onClose={onClose}><form className="company-folder-form" onSubmit={submit}><FolderPlus /><h2>{initial ? "Edit folder" : "Create a company folder"}</h2><p>Folders organize companies independently of industry categories and topics.</p><label>Folder name<input name="name" required maxLength={100} autoFocus defaultValue={initial?.name} placeholder="For example, ROV Subsea" /></label><label>Description <small>(optional)</small><textarea name="description" maxLength={600} rows={3} defaultValue={initial?.description} /></label><fieldset className="company-folder-colors"><legend>Folder color</legend>{folderColors.map((value) => <label className={`folder-color-${value}`} key={value}><input type="radio" name="color" value={value} checked={color === value} onChange={() => setColor(value)} /><span>{value}</span></label>)}</fieldset>{error && <p className="form-error" role="alert">{error}</p>}<div className="form-actions"><button type="button" disabled={busy} className="button outline" onClick={onClose}>Cancel</button><button disabled={busy} className="button primary">{busy ? "Saving…" : initial ? "Save changes" : "Create folder"}</button></div></form></Modal>;
}

export function FolderMembershipDialog({ ids, folders, currentFolderId, onClose, onSaved }: { ids: string[]; folders: FolderOption[]; currentFolderId?: string; onClose: () => void; onSaved: () => void }) {
  const [folderId, setFolderId] = useState(currentFolderId ?? folders[0]?.id ?? ""); const [action, setAction] = useState("add"); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    try { const response = await fetch("/api/companies/folders/membership", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyIds: ids, folderId, action }) }); const body = await response.json(); if (!response.ok) throw new Error(body.error || "Unable to update folders."); onSaved(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to update folders."); } finally { setBusy(false); }
  }
  return <Modal label="Organize company folders" noClose={busy} onClose={onClose}><form className="company-folder-form" onSubmit={submit}><Folder /><h2>Organize {ids.length} compan{ids.length === 1 ? "y" : "ies"}</h2><p>Add to another folder or remove a membership. Company records and other folders are never deleted.</p><label>Folder<select required value={folderId} onChange={(event) => setFolderId(event.target.value)}><option value="" disabled>Select a folder</option>{folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select></label><label>Action<select value={action} onChange={(event) => setAction(event.target.value)}><option value="add">Add to folder</option><option value="remove">Remove from folder only</option></select></label>{error && <p className="form-error" role="alert">{error}</p>}<div className="form-actions"><button type="button" className="button outline" disabled={busy} onClick={onClose}>Cancel</button><button className="button primary" disabled={busy || !folderId}>{busy ? "Saving…" : "Apply"}</button></div></form></Modal>;
}
