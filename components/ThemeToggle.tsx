"use client";

import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";
import { nextTheme, normalizeTheme, THEME_STORAGE_KEY, type Theme } from "@/lib/theme";

export function ThemeToggle({ className = "" }: { className?: string }) {
  const theme = useSyncExternalStore(subscribe, snapshot, serverSnapshot);

  function toggle() {
    const current = normalizeTheme(document.documentElement.dataset.theme);
    const next = nextTheme(current);
    document.documentElement.dataset.theme = next;
    document.documentElement.style.colorScheme = next;
    try { window.localStorage.setItem(THEME_STORAGE_KEY, next); } catch { /* Preference persistence is best-effort. */ }
    window.dispatchEvent(new Event("iec-theme-change"));
  }

  const label = theme === "light" ? "Switch to dark theme" : "Switch to light theme";
  return <button type="button" className={`theme-toggle ${className}`} onClick={toggle} aria-label={label} title={label} aria-pressed={theme === "light"}>
    <span className="theme-toggle-track" aria-hidden="true"><Sun className="theme-sun" /><Moon className="theme-moon" /><i /></span>
  </button>;
}

function subscribe(callback: () => void) {
  const storage = (event: StorageEvent) => {
    if (event.key !== THEME_STORAGE_KEY) return;
    const theme = normalizeTheme(event.newValue);
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    callback();
  };
  window.addEventListener("iec-theme-change", callback);
  window.addEventListener("storage", storage);
  return () => { window.removeEventListener("iec-theme-change", callback); window.removeEventListener("storage", storage); };
}

function snapshot(): Theme { return normalizeTheme(document.documentElement.dataset.theme); }
function serverSnapshot(): Theme { return "dark"; }
