import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// CSS-only browser regression: no server, authentication, database or network fixtures.
// Set CHROME_PATH on platforms where Chrome is not installed at the Windows default.
const chrome = process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const globals = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
const responsive = await readFile(new URL("../app/responsive.css", import.meta.url), "utf8");
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const icon = '<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h16v16H4z" fill="none" stroke="currentColor"/></svg>';
const row = (index: number) => `<article class="exhibition-row">
  <div class="selection-cell"><input type="checkbox" class="selection-checkbox" aria-label="Select exhibition ${index}"><span class="row-number">0${index}</span></div>
  <div class="event-cell"><a href="#details-${index}">International Renewable Energy &amp; Infrastructure Exhibition ${index}</a><p>Connecting international technology and sustainable energy businesses.</p><div class="mini-tags"><button>Renewable Energy</button><button>Infrastructure</button></div></div>
  <div class="info-cell">${icon}<span><b>Renewable Energy &amp; Infrastructure</b><small>Energy &amp; Power</small></span></div>
  <div class="info-cell">${icon}<span><b>Abu Dhabi, United Arab Emirates</b><small>Abu Dhabi National Exhibition Centre</small></span></div>
  <div class="info-cell date-cell">${icon}<span><b>19–23 Apr 2027</b><small dir="rtl" lang="fa">۱۴۰۶ فروردین</small></span></div>
  <div class="status-cell ${index === 1 ? "upcoming" : "past"}"><i></i><span><b>${index === 1 ? "Upcoming" : "Ended"}</b><small>${index === 1 ? "In 342 days" : "Ended 12 days ago"}</small></span></div>
  <div class="followup-cell"><label><input type="checkbox"><span>Pre Email</span></label><label><input type="checkbox"><span>Post Email</span></label></div>
  <div class="exhibitor-list-cell"><label><input type="checkbox"><span>With link</span></label><label><input type="checkbox"><span>No link</span></label></div>
  <div class="visitor-messaging-cell"><input type="checkbox" aria-label="Networking application available"></div>
  <div class="row-actions"><button aria-label="Save exhibition">${icon}</button><a class="button row-view" href="#details-${index}">View ${icon}</a><div class="row-menu-wrap"><button aria-label="More actions">${icon}</button></div></div>
</article>`;

describe.skipIf(!existsSync(chrome))("exhibition responsive layout in Chrome", () => {
  let browser: ChildProcess;
  let ws: WebSocket;
  let sequence = 0;
  const calls = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  function cdp(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = ++sequence;
      const timer = setTimeout(() => { calls.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 10000);
      calls.set(id, { resolve, reject, timer });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async function evaluate<T>(expression: string): Promise<T> {
    const result = await cdp("Runtime.evaluate", { expression, returnByValue: true }) as { exceptionDetails?: { text: string }; result: { value: T } };
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  }
  beforeAll(async () => {
    const profile = await mkdtemp(join(tmpdir(), "iec-exhibition-layout-"));
    browser = spawn(chrome, ["--headless=new", "--no-first-run", "--disable-gpu", "--remote-debugging-port=0", "--remote-debugging-address=127.0.0.1", `--user-data-dir=${profile}`, "about:blank"], { windowsHide: true, stdio: "ignore" });
    let port = "";
    for (let attempt = 0; attempt < 60; attempt++) {
      try { port = (await readFile(join(profile, "DevToolsActivePort"), "utf8")).split("\n")[0]; if (port) break; } catch {}
      await pause(100);
    }
    if (!port) throw new Error("Headless Chrome did not start");
    const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json() as { type: string; webSocketDebuggerUrl: string }[];
    const page = pages.find((entry) => entry.type === "page");
    if (!page) throw new Error("Chrome did not expose a test page");
    ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise<void>((resolve, reject) => { ws.addEventListener("open", () => resolve(), { once: true }); ws.addEventListener("error", () => reject(new Error("CDP connection failed")), { once: true }); });
    ws.addEventListener("message", ({ data }) => {
      const message = JSON.parse(String(data));
      const call = calls.get(message.id);
      if (!call) return;
      calls.delete(message.id); clearTimeout(call.timer);
      if (message.error) call.reject(new Error(message.error.message)); else call.resolve(message.result);
    });
    await cdp("Page.enable");
    // External resources are deliberately blocked; fixtures contain no private data.
    await cdp("Network.enable");
    await cdp("Network.setBlockedURLs", { urls: ["http://*", "https://*"] });
  }, 15000);
  afterAll(async () => {
    if (ws?.readyState === WebSocket.OPEN) await cdp("Browser.close").catch(() => {});
    ws?.close(); browser?.kill();
    for (const call of calls.values()) clearTimeout(call.timer);
  });

  for (const theme of ["dark", "light"]) {
    for (const [width, touch] of [[375, true], [600, true], [601, true], [699, true], [700, false], [768, true], [820, true], [1024, true], [1180, false], [1280, true], [1366, true], [1400, true], [1440, false], [1920, false]] as const) {
      it(`${theme}: full-width exhibition rows and visible controls at ${width}px (${touch ? "touch" : "mouse"})`, async () => {
        await cdp("Emulation.setTouchEmulationEnabled", { enabled: touch, maxTouchPoints: touch ? 5 : 1 });
        await cdp("Emulation.setDeviceMetricsOverride", { width, height: 1100, deviceScaleFactor: 1, mobile: false });
        const frame = await cdp("Page.getFrameTree") as { frameTree: { frame: { id: string } } };
        const html = `<!doctype html><html lang="en" data-theme="${theme}"><head><style>${globals}\n${responsive}</style></head><body><main class="exhibitions-page-container" style="margin:24px auto"><section class="exhibition-table"><div class="table-head">Desktop table</div>${row(1)}${row(2)}</section></main></body></html>`;
        await cdp("Page.setDocumentContent", { frameId: frame.frameTree.frame.id, html });
        const metrics = await evaluate<{ overflow: boolean; stacked: boolean; fullWidth: boolean; fieldsVisible: boolean; fits: boolean; touchTargets: boolean; header: boolean; areas: string; compact: boolean }>(`(() => {
          const table = document.querySelector('.exhibition-table'), rows = [...table.querySelectorAll('.exhibition-row')];
          const rects = rows.map(row => row.getBoundingClientRect());
          const visible = element => getComputedStyle(element).display !== 'none' && element.getBoundingClientRect().width > 0;
          return {
            overflow: document.documentElement.scrollWidth > innerWidth + 1,
            stacked: rects[1].top >= rects[0].bottom && Math.abs(rects[0].left - rects[1].left) < 1,
            fullWidth: rects.every(rect => Math.abs(rect.width - table.getBoundingClientRect().width) < 1),
            fieldsVisible: rows.every(row => [...row.querySelectorAll('.info-cell,.status-cell,.followup-cell,.exhibitor-list-cell,.visitor-messaging-cell,.row-actions')].every(visible)),
            fits: rows.every(row => row.scrollWidth <= row.clientWidth + 1 && [...row.querySelectorAll('b,small,label,.event-cell>a')].filter(visible).every(el => el.scrollWidth <= el.clientWidth + 1)),
            touchTargets: rows.every(row => [...row.querySelectorAll('.followup-cell label,.exhibitor-list-cell label,.row-actions button,.row-view')].every(el => el.getBoundingClientRect().height >= 44)),
            header: visible(table.querySelector('.table-head')),
            areas: getComputedStyle(rows[0]).gridTemplateAreas,
            compact: rects.every(rect => rect.height < (innerWidth < 800 ? 520 : 420))
          };
        })()`);
        if (process.env.IEC_LAYOUT_SCREENSHOTS && [375, 601, 768, 1024, 1366, 1920].includes(width)) {
          await mkdir("outputs/exhibition-tablet-qa", { recursive: true });
          const screenshot = await cdp("Page.captureScreenshot", { format: "png", captureBeyondViewport: false }) as { data: string };
          await writeFile(`outputs/exhibition-tablet-qa/${theme}-${width}.png`, Buffer.from(screenshot.data, "base64"));
        }
        const responsiveMode = width <= 1180 || (touch && width <= 1400);
        if (responsiveMode) {
          expect(metrics.overflow).toBe(false);
          expect(metrics.stacked).toBe(true);
          expect(metrics.fullWidth).toBe(true);
          expect(metrics.fieldsVisible).toBe(true);
          expect(metrics.fits).toBe(true);
          expect(metrics.header).toBe(false);
          if (width > 600) {
            expect(metrics.areas).toContain('"selection event event status"');
            expect(metrics.touchTargets).toBe(true);
            expect(metrics.compact).toBe(true);
          } else expect(metrics.areas).toContain('"event event"');
        } else expect(metrics.header).toBe(true);
      });
    }
  }
});
