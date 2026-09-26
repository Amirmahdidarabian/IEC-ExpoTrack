import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { nextTheme, normalizeTheme, THEME_STORAGE_KEY } from "@/lib/theme";

describe("theme preference", () => {
  it("defaults to dark and only accepts supported values", () => {
    expect(normalizeTheme(undefined)).toBe("dark"); expect(normalizeTheme("system")).toBe("dark"); expect(normalizeTheme("light")).toBe("light");
  });
  it("toggles deterministically", () => { expect(nextTheme("dark")).toBe("light"); expect(nextTheme("light")).toBe("dark"); });
  it("initializes the root theme from persisted local storage before hydration", () => {
    const source = readFileSync("public/theme-init.js", "utf8");
    const root = { dataset: {} as Record<string, string> };
    runInNewContext(source, { window: { localStorage: { getItem: (key: string) => key === THEME_STORAGE_KEY ? "light" : null } }, document: { documentElement: root } });
    expect(root.dataset.theme).toBe("light");
  });
  it("uses dark when no stored preference exists", () => {
    const source = readFileSync("public/theme-init.js", "utf8"); const root = { dataset: {} as Record<string, string> };
    runInNewContext(source, { window: { localStorage: { getItem: () => null } }, document: { documentElement: root } }); expect(root.dataset.theme).toBe("dark");
  });
});
