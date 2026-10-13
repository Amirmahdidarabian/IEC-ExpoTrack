import { afterEach, describe, expect, it, vi } from "vitest";
import { boundedFetch } from "@/lib/client/request";
import { diagnosticText, formatDiagnostics } from "@/lib/client/diagnostics";
import { lockBodyScroll } from "@/lib/client/scroll-lock";

afterEach(() => vi.useRealTimers());

describe("bounded browser requests", () => {
  it("aborts a hung request and does not retry a possibly committed write", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const fetcher = vi.fn((_input, options) => { signal = options.signal; return new Promise<Response>(() => undefined); });
    const pending = boundedFetch(fetcher, "/api/exhibitions/1/save", { method: "POST" }, 100);
    const assertion = expect(pending).rejects.toThrow("Check the latest data");
    await vi.advanceTimersByTimeAsync(101);
    await assertion;
    expect(signal?.aborted).toBe(true);
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it("keeps the caller's cancellation signal and request options", async () => {
    const controller = new AbortController();
    const fetcher = vi.fn(async (_input, options) => { expect(options.method).toBe("PATCH"); expect(options.body).toBe("{}"); controller.abort(); expect(options.signal.aborted).toBe(true); return new Response("ok"); });
    await boundedFetch(fetcher, "/api/example", { method: "PATCH", body: "{}", signal: controller.signal });
  });
  it("allows a later request after more than ten minutes", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn(async () => new Response("ok"));
    await boundedFetch(fetcher, "/api/example");
    await vi.advanceTimersByTimeAsync(11 * 60_000);
    expect((await boundedFetch(fetcher, "/api/example")).ok).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});

describe("downloadable diagnostics", () => {
  it("redacts sensitive query strings, emails and credentials", () => {
    const result = diagnosticText("Failed https://example.com/api/test?token=123 email=user@example.com password=private token=secret api_key=key");
    expect(result).toContain("https://example.com/api/test");
    expect(result).not.toMatch(/123|user@example|private|token=secret|api_key=key/);
  });
  it("exports click warnings and errors with readable timestamps", () => {
    const text = formatDiagnostics([{ time: "2026-10-13T10:00:00Z", kind: "navigation_recovery", route: "/", detail: "/exhibitions" }], "2026-10-13T11:00:00Z", "Test browser");
    expect(text).toContain("navigation_recovery | / | /exhibitions");
    expect(text).toContain("warning, not proof");
    expect(text).toContain("timestamps are UTC");
  });
});

describe("nested modal scroll locks", () => {
  it("restores scrolling only after the last dialog closes, even out of order", () => {
    const body = { style: { overflow: "auto" } } as HTMLElement;
    const releaseParent = lockBodyScroll(body);
    const releaseChild = lockBodyScroll(body);
    releaseParent();
    expect(body.style.overflow).toBe("hidden");
    releaseChild();
    expect(body.style.overflow).toBe("auto");
    releaseChild();
    expect(body.style.overflow).toBe("auto");
  });
});
