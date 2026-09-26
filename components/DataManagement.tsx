"use client";

import { AlertTriangle, CheckCircle2, Download, FileJson, Upload } from "lucide-react";
import { ChangeEvent, useRef, useState } from "react";
import { Modal } from "./Modal";

type Preview = { filename: string; formatVersion: number; exportedAt: string; exhibitions: number; categories: number; topics: number; newRecords: number; existingRecords: number; invalidRecords: number; warnings: string[] };
type Result = { exhibitions: { processed: number; created: number; updated: number; skipped: number }; categories: { processed: number; created: number; updated: number }; topics: { processed: number; created: number; updated: number }; errors: number };

async function responseError(response: Response, fallback: string) { try { return (await response.json()).error || fallback; } catch { return fallback; } }

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
    <section className="panel data-card"><span className="data-icon"><Download /></span><div><p className="eyebrow">Portable backup</p><h2>Export Data</h2><p>Download all IEC exhibition records, taxonomy, sources, relationships and follow-up state as versioned JSON.</p></div><button className="button primary" onClick={exportData} disabled={busy !== null}><Download />{busy === "export" ? "Preparing…" : "Export JSON"}</button></section>
    <section className="panel data-card import-card"><span className="data-icon warning"><Upload /></span><div><p className="eyebrow">Validated restore</p><h2>Import Data</h2><p>Merge an IEC JSON backup into the current dataset. Existing records may be updated; records absent from the backup are retained.</p></div>
      <input ref={inputRef} className="sr-only" id="backup-file" type="file" accept=".json,application/json" onChange={selectFile} disabled={busy !== null} /><label className="button outline" htmlFor="backup-file"><FileJson />{busy === "preview" ? "Validating…" : "Select JSON File"}</label>
      {file && <p className="selected-file"><FileJson /><span><small>Selected file</small><b>{file.name}</b></span></p>}
      {preview && <div className="import-preview"><div className="section-heading"><div><p className="eyebrow">Validation passed</p><h3>Import Preview</h3></div><b className="version-badge">Version {preview.formatVersion}</b></div><dl><div><dt>Export date</dt><dd>{new Date(preview.exportedAt).toLocaleString()}</dd></div><div><dt>Exhibitions</dt><dd>{preview.exhibitions}</dd></div><div><dt>Categories</dt><dd>{preview.categories}</dd></div><div><dt>Topics</dt><dd>{preview.topics}</dd></div><div><dt>New records</dt><dd>{preview.newRecords}</dd></div><div><dt>Existing matches</dt><dd>{preview.existingRecords}</dd></div><div><dt>Invalid records</dt><dd>{preview.invalidRecords}</dd></div></dl>{preview.warnings.length > 0 && <div className="import-warnings"><AlertTriangle /><div><b>Warnings</b>{preview.warnings.map((warning) => <p key={warning}>{warning}</p>)}</div></div>}<div className="preview-actions"><button className="button outline" onClick={cancelSelection}>Cancel</button><button className="button destructive" onClick={() => setConfirming(true)}><Upload />Import Data</button></div></div>}
      {result && <div className="import-result" role="status"><CheckCircle2 /><div><h3>Import completed</h3><p>{result.exhibitions.processed} exhibitions, {result.categories.processed} categories and {result.topics.processed} topics processed.</p><dl><div><dt>Created exhibitions</dt><dd>{result.exhibitions.created}</dd></div><div><dt>Updated exhibitions</dt><dd>{result.exhibitions.updated}</dd></div><div><dt>Skipped</dt><dd>{result.exhibitions.skipped}</dd></div><div><dt>Errors</dt><dd>{result.errors}</dd></div></dl></div></div>}{busy === "import" && <p className="inline-message">Importing inside one database transaction…</p>}
    </section>
    {error && <p className="form-error data-error" role="alert">{error}</p>}
    {confirming && preview && <Modal label="Confirm IEC data import" className="import-confirm-modal" onClose={() => setConfirming(false)}><div className="confirm-icon"><AlertTriangle /></div><h2>Import IEC Data?</h2><p>This will merge the selected backup with the current database. Existing records may be updated.</p><dl><div><dt>Exhibitions</dt><dd>{preview.exhibitions}</dd></div><div><dt>Categories</dt><dd>{preview.categories}</dd></div><div><dt>Topics</dt><dd>{preview.topics}</dd></div></dl><div className="preview-actions"><button className="button outline" onClick={() => setConfirming(false)}>Cancel</button><button className="button destructive" onClick={confirmImport}>Confirm Import</button></div></Modal>}
  </div>;
}
