"use client";

import { X } from "lucide-react";
import { ReactNode, useEffect, useRef } from "react";

export function Modal({ children, onClose, className = "", label, noClose = false }: { children: ReactNode; onClose: () => void; className?: string; label: string; noClose?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const handler = (event: KeyboardEvent) => { if (event.key === "Escape" && !noClose) onClose(); };
    document.addEventListener("keydown", handler);
    ref.current?.focus();
    return () => { document.removeEventListener("keydown", handler); previous?.focus(); };
  }, [onClose, noClose]);
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !noClose) onClose(); }}><div ref={ref} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1} className={`modal-shell ${className}`}>{!noClose && <button className="modal-close" onClick={onClose} aria-label="Close dialog"><X /></button>}{children}</div></div>;
}
