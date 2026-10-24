"use client";

import { AlertTriangle, CheckCircle2, Download, FileJson, Upload } from "lucide-react";
import { ChangeEvent, useRef, useState } from "react";
import { Modal } from "./Modal";
import type { ImportPreview } from "@/lib/data-management/service";

type Preview = ImportPreview & { filename: string };
type Counts = { processed: number; created?: number; updated?: number; skipped?: number };
type Result = { exhibitions: Counts; categories: Counts; topics: Counts; companies?: Counts; companyFolders?: Counts; media?: Counts; users?: Counts; auditLogs?: Counts; companyImportJobs?: Counts; mediaImportJobs?: Counts; errors: number };

async function responseError(response: Response, fallback: string) { try { return (await response.json()).error || fallback; } catch { return fallback; } }

const sectionLabels = { exhibitions: "Exhibitions", categories: "Categories", topics: "Topics", companies: "Companies", companyFolders: "Company folders", companyContacts: "Company contacts", media: "Media publications", mediaContacts: "Media contacts", savedExhibitions: "Saved exhibitions", savedCompanies: "Saved companies", users: "User profiles", auditLogs: "Activity history", importJobs: "Excel import history" } as const;
function PreviewCounts({ preview }: { preview: Preview }) {
  return <dl>{Object.entries(sectionLabels).filter(([key]) => preview.formatVersion === 2 || ["exhibitions", "categories", "topics", "savedExhibitions"].includes(key)).map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{preview[key as keyof typeof sectionLabels].toLocaleString()}</dd></div>)}</dl>;
}

export function DataManagement() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null); const [preview, setPreview] = useState<Preview | null>(null); const [result, setResult] = useState<Result | null>(null);
  const [confirming, setConfirming] = useState(false); const [busy, setBusy] = useState<"export" | "preview" | "import" | null>(null); const [error, setError] = useState("");

  async function exportData() {
    setBusy("export"); setError("");
    try {
      const response = await fetch("/api/admin/data/export", { method: "POST" });
      if (!response.ok) throw new Error(await responseError(response, "Export failed."));
      const blob = await response.blob(); const disposition = response.headers.get("content-disposition") ?? "";
      const filename = disposition.match(/filename="([^"]+)"/)?.[1] ?? "iec-expotrack-backup.json";
      const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = filename; document.body.append(link); link.click(); link.remove(); URL.revokeObjectURL(url);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Export failed."); } finally { setBusy(null); }
  }

  async function selectFile(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null; setFile(selected); setPreview(null); setResult(null); setError(""); if (!selected) return; setBusy("preview");
    try { const body = new FormData(); body.set("file", selected); const response = await fetch("/api/admin/data/preview", { method: "POST", body }); if (!response.ok) throw new Error(await responseError(response, "Unable to validate backup.")); setPreview(await response.json()); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to validate backup."); } finally { setBusy(null); }
  }

  function cancelSelection() { setFile(null); setPreview(null); setResult(null); setError(""); if (inputRef.current) inputRef.current.value = ""; }

  async function confirmImport() {
    if (!file) return; setConfirming(false); setBusy("import"); setError("");
    try { const body = new FormData(); body.set("file", file); const response = await fetch("/api/admin/data/import", { method: "POST", body }); if (!response.ok) throw new Error(await responseError(response, "Import failed. No data was changed.")); setResult(await response.json()); setPreview(null); setFile(null); if (inputRef.current) inputRef.current.value = ""; }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Import failed. No data was changed."); } finally { setBusy(null); }
  }

  return <div className="data-management-grid">
    <section className="panel data-card"><span className="data-icon"><Download /></span><div><p className="eyebrow">Full application backup · JSON v2</p><h2>Export Data</h2><p>Back up Exhibitions, Companies, Media, Saved and Administration in one file: contacts, notes, social links, folders, classifications, follow-up state, user profiles, permissions, activity and Excel import history.</p><p className="backup-security">Passwords, login sessions, environment secrets and server configuration are excluded. This file contains private business and contact data. Store it securely; never commit it to GitHub.</p></div><button className="button primary" onClick={exportData} disabled={busy !== null}><Download />{busy === "export" ? "Preparing…" : "Export JSON"}</button></section>
    <section className="panel data-card import-card"><span className="data-icon warning"><Upload /></span><div><p className="eyebrow">Validated restore · up to 50 MB</p><h2>Import Data</h2><p>Restore included records and their related data from a snapshot. Records absent from the file are retained. Export a fresh backup first. Existing accounts and access stay unchanged; new profiles remain disabled until an administrator resets their password and enables them. Legacy v1 backups are also supported.</p></div>
      <input ref={inputRef} className="sr-only" id="backup-file" type="file" accept=".json,application/json" onChange={selectFile} disabled={busy !== null} /><label className="button outline" htmlFor="backup-file"><FileJson />{busy === "preview" ? "Validating…" : "Select JSON File"}</label>
      {file && <p className="selected-file"><FileJson /><span><small>Selected file</small><b>{file.name}</b></span></p>}
      {preview && <div className="import-preview backup-preview"><div className="section-heading"><div><p className="eyebrow">Validation passed</p><h3>Import Preview</h3></div><b className="version-badge">Version {preview.formatVersion}</b></div><dl><div><dt>Export date</dt><dd>{new Date(preview.exportedAt).toLocaleString()}</dd></div><div><dt>New parent records / profiles</dt><dd>{preview.newRecords}</dd></div><div><dt>Existing matches</dt><dd>{preview.existingRecords}</dd></div><div><dt>Invalid records</dt><dd>{preview.invalidRecords}</dd></div></dl><PreviewCounts preview={preview} />{preview.warnings.length > 0 && <div className="import-warnings"><AlertTriangle /><div><b>Warnings</b>{preview.warnings.map((warning) => <p key={warning}>{warning}</p>)}</div></div>}<div className="preview-actions"><button className="button outline" onClick={cancelSelection}>Cancel</button><button className="button destructive" onClick={() => setConfirming(true)}><Upload />Import Data</button></div></div>}
      {result && <div className="import-result" role="status"><CheckCircle2 /><div><h3>Import completed</h3><p>All included sections were processed in one transaction.</p><dl>{Object.entries(sectionLabels).map(([key, label]) => { const counts = result[key as keyof Result]; return counts && typeof counts === "object" ? <div key={key}><dt>{label}</dt><dd>{counts.processed.toLocaleString()}</dd></div> : null; })}</dl>{result.users && <p>New profiles remain disabled; existing accounts and permissions are unchanged.</p>}<dl><div><dt>Created exhibitions</dt><dd>{result.exhibitions.created}</dd></div><div><dt>Updated exhibitions</dt><dd>{result.exhibitions.updated}</dd></div><div><dt>Skipped</dt><dd>{result.exhibitions.skipped ?? 0}</dd></div><div><dt>Errors</dt><dd>{result.errors}</dd></div></dl></div></div>}{busy === "import" && <p className="inline-message">Importing inside one database transaction…</p>}
    </section>
    {error && <p className="form-error data-error" role="alert">{error}</p>}
    {confirming && preview && <Modal label="Confirm IEC data import" className="import-confirm-modal" onClose={() => setConfirming(false)}><div className="confirm-icon"><AlertTriangle /></div><h2>Import IEC Data?</h2><p>Included records and their contacts, notes, saved state and relationships will be restored from the selected snapshot. Newer related data on those records may be replaced. Parent records absent from the file are retained. Keep a fresh backup first. Existing passwords and access stay unchanged; new profiles remain disabled.</p><PreviewCounts preview={preview} /><div className="preview-actions"><button className="button outline" onClick={() => setConfirming(false)}>Cancel</button><button className="button destructive" onClick={confirmImport}>Confirm Import</button></div></Modal>}
  </div>;
}
