export type DiagnosticEvent = {
  time: string;
  kind: string;
  route: string;
  detail: string;
};

const STORAGE_KEY = "iec-diagnostics-v1"; // gitleaks:allow -- browser storage namespace, not a credential
const MAX_EVENTS = 400;
let events: DiagnosticEvent[] = [];
let restored = false;

/** Never include form values, request bodies, cookies, or URL query strings. */
export function diagnosticText(value: string) {
  return value.replace(/https?:\/\/[^\s)]+/g, (url) => {
    try { const parsed = new URL(url); return `${parsed.origin}${parsed.pathname}`; } catch { return "[url]"; }
  }).replace(/\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/gi, "[email]")
    .replace(/((?:password(?:Hash)?|token|secret|authorization|api[_-]?key)["']?\s*[:=]\s*["']?)[^\s,;"']+/gi, "$1[redacted]")
    .replace(/[\r\n\t]+/g, " ").slice(0, 500);
}

export function recordDiagnostic(kind: string, detail: string) {
  if (typeof window === "undefined") return;
  if (!restored) {
    restored = true;
    try {
      const stored: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
      if (Array.isArray(stored)) events = stored.filter((item): item is DiagnosticEvent =>
        item && [item.time, item.kind, item.route, item.detail].every((value) => typeof value === "string")).slice(-MAX_EVENTS);
    } catch { /* Logging also works when browser storage is disabled. */ }
  }
  events.push({ time: new Date().toISOString(), kind, route: window.location.pathname, detail: diagnosticText(detail) });
  events = events.slice(-MAX_EVENTS);
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(events)); } catch { /* Keep the in-memory report. */ }
}

export function formatDiagnostics(items: DiagnosticEvent[], generatedAt: string, browser: string) {
  return ["IEC ExpoTrack — browser diagnostics", `Generated (UTC): ${generatedAt}`, `Browser: ${diagnosticText(browser)}`,
    "Scope: recent activity in this browser; timestamps are UTC.",
    "A click with no observable response is a warning, not proof that the action failed.",
    "Request failures, timeouts, JavaScript errors and navigation recovery are recorded.",
    "No form values, request bodies, cookies, or URL query strings are collected.", "",
    ...items.map((item) => `[${item.time}] ${item.kind} | ${item.route} | ${item.detail}`),
  ].join("\r\n");
}

export function downloadDiagnostics() {
  recordDiagnostic("report_export", "User downloaded diagnostics");
  const now = new Date().toISOString();
  const blob = new Blob(["\uFEFF", formatDiagnostics(events, now, navigator.userAgent)], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `iec-diagnostics-${now.replace(/[:.]/g, "-")}.txt`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
