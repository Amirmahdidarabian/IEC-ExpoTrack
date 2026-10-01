"use client";

import { X } from "lucide-react";
import { ReactNode, useEffect, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

const subscribeToClient = () => () => undefined;
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

export function Modal({ children, onClose, className = "", label, noClose = false }: { children: ReactNode; onClose: () => void; className?: string; label: string; noClose?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const mounted = useSyncExternalStore(subscribeToClient, getClientSnapshot, getServerSnapshot);
  const portalTarget = mounted ? document.body : null;
  useEffect(() => {
    if (!portalTarget) return;
    const previous = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handler = (event: KeyboardEvent) => {
      const dialogs = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')];
      if (dialogs.at(-1) !== ref.current) return;
      if (event.key === "Escape" && !noClose) { event.preventDefault(); onClose(); return; }
      if (event.key !== "Tab" || !ref.current) return;
      const focusable = [...ref.current.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')];
      if (!focusable.length) { event.preventDefault(); ref.current.focus(); return; }
      const first = focusable[0]; const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", handler);
    ref.current?.focus();
    return () => { document.removeEventListener("keydown", handler); document.body.style.overflow = previousOverflow; previous?.focus(); };
  }, [onClose, noClose, portalTarget]);

  if (!portalTarget) return null;
  return createPortal(<div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !noClose) onClose(); }}><div ref={ref} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1} className={`modal-shell ${className}`}>{!noClose && <button type="button" className="modal-close" onClick={onClose} aria-label="Close dialog"><X /></button>}{children}</div></div>, portalTarget);
}
