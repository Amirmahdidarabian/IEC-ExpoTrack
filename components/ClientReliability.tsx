"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { recordDiagnostic } from "@/lib/client/diagnostics";
import { boundedFetch } from "@/lib/client/request";

export function ClientReliability() {
  const pathname = usePathname();
  const [notice, setNotice] = useState("");
  useEffect(() => { recordDiagnostic("route_loaded", pathname ?? "/"); }, [pathname]);
  useEffect(() => {
    recordDiagnostic("page_ready", navigator.onLine ? "Online" : "Offline");
    const originalFetch = window.fetch;
    let requests = 0;
    let changes = 0;
    let navigating = false;
    let noticeTimer: ReturnType<typeof setTimeout>;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    let navigationTimer: ReturnType<typeof setTimeout> | undefined;
    const showNotice = (message: string) => {
      setNotice(message);
      clearTimeout(noticeTimer);
      noticeTimer = setTimeout(() => setNotice(""), 8000);
    };
    const wrappedFetch: typeof fetch = async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input), window.location.href);
      const isApi = url.origin === window.location.origin && url.pathname.startsWith("/api/");
      if (!isApi) return originalFetch(input, init);
      requests++;
      const start = performance.now();
      const method = init?.method ?? (input instanceof Request ? input.method : "GET");
      const longRunning = /\/(import|search-ai)$/.test(url.pathname);
      try {
        const response = await boundedFetch(originalFetch.bind(window), input, init, longRunning ? 150_000 : 30_000);
        recordDiagnostic(response.ok ? "request_ok" : "request_error", `${method} ${url.pathname} — HTTP ${response.status}, ${Math.round(performance.now() - start)}ms`);
        if (!response.ok) void response.clone().json().then((payload: { error?: unknown }) => {
          if (typeof payload.error === "string") recordDiagnostic("site_error", `${url.pathname} — ${payload.error}`);
        }).catch(() => undefined);
        if (response.status === 401 && url.pathname !== "/api/auth/login" && window.location.pathname !== "/login" && !navigating) {
          navigating = true;
          recordDiagnostic("session_expired", "Redirecting to sign in");
          window.location.assign(new URL(`/login?next=${encodeURIComponent(window.location.pathname)}`, window.location.origin).href);
        } else if (!response.ok && url.pathname !== "/api/auth/session") {
          showNotice(response.status === 403 ? "This action is not permitted for your account." : "The request failed. Check the message in the form or download diagnostics.");
        }
        return response;
      } catch (error) {
        if (!(init?.signal?.aborted || (input instanceof Request && input.signal.aborted))) {
          recordDiagnostic("request_failed", `${method} ${url.pathname} — ${error instanceof Error ? error.message : "Network error"}`);
          showNotice(error instanceof Error ? error.message : "Connection failed. Please check your network.");
        }
        throw error;
      }
    };
    window.fetch = wrappedFetch;
    const observer = new MutationObserver(() => { changes++; });
    observer.observe(document.body, { childList: true, attributes: true, subtree: true, characterData: true });
    const onClick = (event: MouseEvent) => {
      if (!(event.target instanceof Element) || event.button !== 0) return;
      const control = event.target.closest<HTMLElement>('a[href], button, [role="button"], input[type="checkbox"], select');
      if (!control || control.closest("[data-diagnostics]") || control.matches(":disabled")) return;
      const label = (control.getAttribute("aria-label") || control.textContent?.trim() || control.tagName).slice(0, 100);
      const from = window.location.href;
      const domBefore = changes;
      const requestsBefore = requests;
      recordDiagnostic("click", label);
      const anchor = control.closest<HTMLAnchorElement>("a[href]");
      if (control.tagName === "SELECT" || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || (anchor && (anchor.hasAttribute("download") || (anchor.target && anchor.target !== "_self") || new URL(anchor.href, from).origin !== window.location.origin))) return;
      const timer = setTimeout(() => {
        timers.delete(timer);
        if (window.location.href === from && changes === domBefore && requests === requestsBefore && control.isConnected) {
          recordDiagnostic("click_no_observable_response", `${label} — no DOM, request, or URL change within 6s`);
        }
      }, 6000);
      timers.add(timer);
      if (!anchor) return;
      const destination = new URL(anchor.href, from);
      if (destination.origin !== window.location.origin || destination.href === from || (destination.pathname === window.location.pathname && destination.search === window.location.search)) return;
      clearTimeout(navigationTimer);
      recordDiagnostic("navigation_start", destination.pathname);
      navigationTimer = setTimeout(() => {
        if (window.location.href !== from || navigating) return;
        recordDiagnostic("navigation_recovery", `${destination.pathname} — client navigation did not complete within 10s; opening normally`);
        navigating = true;
        window.location.assign(destination.href);
      }, 10_000);
    };
    const onError = (event: ErrorEvent) => recordDiagnostic("javascript_error", `${event.message} ${event.filename}:${event.lineno}`);
    const onRejection = (event: PromiseRejectionEvent) => recordDiagnostic("unhandled_rejection", event.reason instanceof Error ? event.reason.message : "Unhandled async error");
    const offline = () => { recordDiagnostic("offline", "Browser lost network connectivity"); showNotice("You are offline. Changes cannot be saved until the connection returns."); };
    const online = () => { recordDiagnostic("online", "Browser connection restored"); };
    let lastCheck = 0;
    const checkSession = () => {
      if (document.visibilityState !== "visible" || !navigator.onLine || ["/", "/login"].includes(window.location.pathname) || Date.now() - lastCheck < 60_000) return;
      lastCheck = Date.now();
      void window.fetch("/api/auth/session", { cache: "no-store" }).catch(() => undefined);
    };
    const interval = setInterval(checkSession, 120_000);
    document.addEventListener("click", onClick, true);
    document.addEventListener("visibilitychange", checkSession);
    window.addEventListener("focus", checkSession);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    window.addEventListener("offline", offline);
    window.addEventListener("online", online);
    return () => {
      if (window.fetch === wrappedFetch) window.fetch = originalFetch;
      observer.disconnect();
      clearInterval(interval);
      clearTimeout(noticeTimer);
      clearTimeout(navigationTimer);
      timers.forEach(clearTimeout);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("visibilitychange", checkSession);
      window.removeEventListener("focus", checkSession);
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
      window.removeEventListener("offline", offline);
      window.removeEventListener("online", online);
    };
  }, []);
  return notice ? <div className="client-diagnostics" data-diagnostics><div className="client-reliability-notice" role="alert">{notice}<button type="button" onClick={() => setNotice("")} aria-label="Dismiss notification">×</button></div></div> : null;
}
