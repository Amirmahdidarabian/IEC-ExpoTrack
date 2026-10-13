import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import JSZip from "jszip";

const require = createRequire(import.meta.url);
const pluginRequire = createRequire(require.resolve("@next/eslint-plugin-next"));
const { getRootDirs } = pluginRequire("./utils/get-root-dirs.js");

describe("security dependency replacements", () => {
  it("retains Next ESLint's default root and directory-only root globbing", () => {
    expect(getRootDirs({ cwd: process.cwd(), settings: {} })).toEqual([process.cwd()]);
    const directoryNames = (entries: string[]) => entries.map((entry) => entry.replace(/\/$/, "")).sort();
    expect(directoryNames(getRootDirs({ cwd: process.cwd(), settings: { next: { rootDir: "lib/*" } } }))).toEqual(expect.arrayContaining(["lib/auth", "lib/exhibitions"]));
    expect(directoryNames(getRootDirs({ cwd: process.cwd(), settings: { next: { rootDir: "lib/{auth,exhibitions}" } } }))).toEqual(["lib/auth", "lib/exhibitions"]);
    expect(getRootDirs({ cwd: process.cwd(), settings: { next: { rootDir: ["lib/auth/*", "lib/exhibitions/*"] } } }).every((entry: string) => !entry.endsWith(".ts"))).toBe(true);
  });
  it("uses a glob implementation with no braces or micromatch dependency", () => {
    const globPackage = require("node:fs").readFileSync(require("node:path").join(require("node:path").dirname(pluginRequire.resolve("fast-glob")), "../package.json"), "utf8");
    const manifest = JSON.parse(globPackage);
    expect(manifest.name).toBe("tinyglobby");
    expect(manifest.dependencies.braces).toBeUndefined();
    expect(manifest.dependencies.micromatch).toBeUndefined();
  });
  it("preserves ExcelJS extended conditional formatting with the UUID override", async () => {
    const source = new ExcelJS.Workbook();
    const sheet = source.addWorksheet("Compatibility");
    sheet.addRows([[10], [20], [30]]);
    sheet.addConditionalFormatting({ ref: "A1:A3", rules: [{ type: "dataBar", priority: 1, cfvo: [{ type: "min" }, { type: "max" }] }] });
    const data = await source.xlsx.writeBuffer();
    const loaded = new ExcelJS.Workbook();
    await loaded.xlsx.load(data);
    expect(loaded.worksheets[0].getCell("A3").value).toBe(30);
    const archive = await JSZip.loadAsync(data);
    const xml = await archive.file("xl/worksheets/sheet1.xml")!.async("string");
    expect(xml).toContain("x14:conditionalFormattings");
    expect(xml).toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);
  });
});
