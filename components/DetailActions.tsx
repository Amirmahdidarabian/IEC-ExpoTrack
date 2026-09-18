"use client";

import { Bookmark, EllipsisVertical, Heart, Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Exhibition } from "@/lib/exhibitions/types";
import { Modal } from "./Modal";
import { ReviewModal } from "./ReviewModal";

export function DetailActions({ exhibition }: { exhibition: Exhibition }) {
  const router = useRouter(); const [saved, setSaved] = useState(exhibition.saved); const [editing, setEditing] = useState(false); const [menu, setMenu] = useState(false); const [deleting, setDeleting] = useState(false);
  async function save() { const response = await fetch(`/api/exhibitions/${exhibition.id}/save`, { method: "POST" }); if (response.ok) setSaved((await response.json()).saved); }
  async function remove() { const response = await fetch(`/api/exhibitions/${exhibition.id}`, { method: "DELETE" }); if (response.ok) router.push("/exhibitions"); }
  return <div className="detail-actions"><button className="button detail-save" onClick={save}>{saved ? <Bookmark /> : <Heart />}{saved ? "Saved" : "Save"}</button><button className="button detail-edit" onClick={() => setEditing(true)}><Pencil /> Edit</button><div className="row-menu-wrap"><button className="icon-button" onClick={() => setMenu((v) => !v)} aria-label="More actions"><EllipsisVertical /></button>{menu && <div className="row-menu"><button className="danger" onClick={() => { setDeleting(true); setMenu(false); }}>Delete Exhibition</button></div>}</div>{editing && <ReviewModal initial={exhibition} mode="edit" onClose={() => setEditing(false)} onSaved={() => router.refresh()} />}{deleting && <Modal onClose={() => setDeleting(false)} label="Delete exhibition"><div className="delete-dialog"><div className="delete-icon"><Trash2 /></div><h2>Delete Exhibition?</h2><p>Are you sure you want to delete <strong>“{exhibition.name}”</strong>?<br />This action cannot be undone.</p><div><button className="button outline" onClick={() => setDeleting(false)}>Cancel</button><button className="button destructive" onClick={remove}>Delete Exhibition</button></div></div></Modal>}</div>;
}
