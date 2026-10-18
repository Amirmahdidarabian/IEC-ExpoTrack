"use client";

import Link from "next/link";
import { ChevronRight, ExternalLink, Globe2, MoreHorizontal, Pencil, Trash2, Users, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { MediaAbilities, MediaList } from "@/lib/media/types";

type Item = MediaList["items"][number];
type Props = {
  result: MediaList;
  selected: string | null;
  searchParams: string;
  abilities: MediaAbilities;
  pending: boolean;
  menu: string | null;
  onMenu: (id: string | null) => void;
  onOpen: (id: string, tab?: "contacts") => void;
  onEdit: (id: string) => void;
  onDelete: (item: Item) => void;
};

export function MediaTable({ result, selected, searchParams, abilities, pending, menu, onMenu, onOpen, onEdit, onDelete }: Props) {
  const offset = result.pageSize === "all" ? 0 : (result.page - 1) * result.pageSize;
  return <div className="media-table-wrap" aria-busy={pending}>
    <table className="media-table" aria-label="Media publications">
      <thead><tr><th scope="col">#</th><th scope="col">Publication</th><th scope="col">Category & coverage</th><th scope="col">Country / region</th><th scope="col">Contacts</th><th scope="col">Updated</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
      <tbody>{result.items.map((item, index) => {
        const params = new URLSearchParams(searchParams); params.set("outlet", item.id); params.delete("tab");
        return <tr key={item.id} className={selected === item.id ? "selected" : ""} onClick={event => {
          if (!(event.target as HTMLElement).closest("a,button,input,select")) onOpen(item.id);
        }}>
          <td className="media-row-number">{String(offset + index + 1).padStart(2, "0")}</td>
          <td className="media-identity-cell" data-label="Publication">
            <Link className="media-publication-name" href={`/media?${params}`} scroll={false}>{item.name}</Link>
            {item.websiteUrl ? <a className="media-domain" href={item.websiteUrl} target="_blank" rel="noopener noreferrer" aria-label={`Visit ${item.name} website (opens a new tab)`}>{item.domain?.replace(/^www\./, "")}<ExternalLink aria-hidden="true" /></a> : <span className="media-missing">No website provided</span>}
          </td>
          <td className="media-category-cell" data-label="Category & coverage">
            {item.categories.length > 0 && <div className="company-chips media-mapped-tags">{item.categories.map(value => <span key={value.id}>{value.name}</span>)}</div>}
            {item.sourceCategoryRaw ? <span className={`media-source-tag ${item.categories.length ? "has-mapping" : ""}`}><span className="sr-only">Imported category: </span>{item.categories.length > 0 && <span>Source: </span>}{item.sourceCategoryRaw}</span> : !item.categories.length && <span className="media-missing">Not classified</span>}
          </td>
          <td className="media-location-cell" data-label="Country / region">
            <span className="media-location">{item.countryCode ? <span className={`fi fi-${item.countryCode.toLowerCase()}`} aria-hidden="true" /> : <Globe2 aria-hidden="true" />}<span>{item.countryName ?? item.publicationScopeRaw ?? "Not provided"}</span></span>
            {item.countryName && item.publicationScopeRaw && item.countryName !== item.publicationScopeRaw && <small>{item.publicationScopeRaw}</small>}
          </td>
          <td className="media-contacts-cell" data-label="Contacts">
            <button className="media-contact-count" aria-label={`View ${item.contactsCount} contacts for ${item.name}`} onClick={() => onOpen(item.id, "contacts")}><Users aria-hidden="true" /><span>{item.contactsCount} <span className="media-count-word">contact{item.contactsCount === 1 ? "" : "s"}</span></span><ChevronRight aria-hidden="true" /></button>
          </td>
          <td className="media-updated-cell" data-label="Updated"><time dateTime={item.updatedAt}>{new Date(item.updatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</time></td>
          <td className="media-row-actions">{(abilities.canUpdate || abilities.canDelete) && <RowMenu item={item} open={menu === item.id} onToggle={() => onMenu(menu === item.id ? null : item.id)} onClose={() => onMenu(null)} abilities={abilities} onEdit={() => onEdit(item.id)} onDelete={() => onDelete(item)} />}</td>
        </tr>;
      })}</tbody>
    </table>
  </div>;
}

function RowMenu({ item, open, onToggle, onClose, abilities, onEdit, onDelete }: { item: Item; open: boolean; onToggle: () => void; onClose: () => void; abilities: MediaAbilities; onEdit: () => void; onDelete: () => void }) {
  const ref = useRef<HTMLDivElement>(null), closeRef = useRef(onClose);
  const [above, setAbove] = useState(false);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!ref.current?.contains(event.target as Node)) closeRef.current(); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); closeRef.current(); ref.current?.querySelector<HTMLButtonElement>("button")?.focus(); } };
    document.addEventListener("pointerdown", outside); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [open]);
  return <div className="media-row-menu-wrap" ref={ref}>
    <button className="icon-button" aria-label={`Actions for ${item.name}`} aria-expanded={open} aria-controls={open ? `media-actions-${item.id}` : undefined} onClick={event => { setAbove(window.innerHeight-event.currentTarget.getBoundingClientRect().bottom<170); onToggle(); }}><MoreHorizontal /></button>
    {open && <div className={`media-action-menu ${above?"is-above":""}`} id={`media-actions-${item.id}`} aria-label={`Actions for ${item.name}`}>
      {abilities.canUpdate && <button onClick={onEdit}><Pencil />Edit Media</button>}
      {abilities.canDelete && <button className="danger" onClick={onDelete}><Trash2 />Delete Media</button>}
      <button onClick={onClose}><X />Close menu</button>
    </div>}
  </div>;
}
