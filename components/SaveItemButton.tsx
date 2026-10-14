"use client";

import { Bookmark, Heart, LoaderCircle } from "lucide-react";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { boundedFetch } from "@/lib/client/request";

/** Disable repeat toggles until the server confirms the persisted saved state. */
export function SaveItemButton({ kind, id, saved, className = "", showLabel = false }: { kind: "exhibitions" | "companies"; id: string; saved: boolean; className?: string; showLabel?: boolean }) {
  const router = useRouter();
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState<{ source: boolean; value: boolean } | null>(null);
  const [error, setError] = useState("");
  const isSaved = confirmed?.source === saved ? confirmed.value : saved;
  const name = kind === "exhibitions" ? "exhibition" : "company";
  async function toggle() {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError("");
    try {
      const response = await boundedFetch(fetch, `/api/${kind}/${id}/save`, { method: "POST" });
      if (!response.ok) throw new Error(`Unable to update saved ${name}. Please try again.`);
      const payload = await response.json();
      if (typeof payload.saved !== "boolean") throw new Error("The saved status could not be confirmed. Refresh before trying again.");
      setConfirmed({ source: saved, value: payload.saved });
      router.refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to update saved status."); }
    finally { pending.current = false; setBusy(false); }
  }
  return <>
    <button type="button" onClick={toggle} disabled={busy} className={`${className}${isSaved ? " saved" : ""}`.trim()} aria-pressed={isSaved} aria-busy={busy} aria-label={`${isSaved ? "Unsave" : "Save"} ${name}`} title={`${isSaved ? "Remove" : "Add"} ${name} ${isSaved ? "from" : "to"} Saved`}>
      {busy ? <LoaderCircle className="save-spinner" /> : isSaved ? <Bookmark /> : <Heart />}
      {showLabel && (busy ? "Saving…" : isSaved ? "Saved" : "Save")}
    </button>
    {error && <div className="inline-notice save-error" role="alert"><span>{error}</span><button type="button" onClick={() => setError("")} aria-label="Dismiss save error">×</button></div>}
  </>;
}
