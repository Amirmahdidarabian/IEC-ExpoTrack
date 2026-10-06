import ExcelJS from "exceljs";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import {
  normalizeNamespacedXlsx,
  normalizeRelationshipTargets,
  normalizeSpreadsheetXml,
} from "@/lib/companies/xlsx-normalization";

const SPREADSHEETML_NAMESPACE = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";

function toArrayBuffer(buffer: Buffer) {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
}

function prefixSpreadsheetElements(xml: string) {
  if (!xml.includes(`xmlns="${SPREADSHEETML_NAMESPACE}"`)) return xml;

  return xml
    .replace(`xmlns="${SPREADSHEETML_NAMESPACE}"`, `xmlns:x="${SPREADSHEETML_NAMESPACE}"`)
    .replace(/<(\/)?([A-Za-z][\w.-]*)(?=[\s/>])/g, "<$1x:$2");
}

describe("XLSX compatibility normalization", () => {
  it("only removes x prefixes when x is the SpreadsheetML namespace", () => {
    const workbookXml = `<x:workbook xmlns:x="${SPREADSHEETML_NAMESPACE}"><x:sheets /></x:workbook>`;
    expect(normalizeSpreadsheetXml(workbookXml)).toBe(
      `<workbook xmlns="${SPREADSHEETML_NAMESPACE}"><sheets /></workbook>`,
    );

    const drawingXml = '<x:graphic xmlns:x="urn:not-spreadsheetml"><x:item /></x:graphic>';
    expect(normalizeSpreadsheetXml(drawingXml)).toBe(drawingXml);
  });

  it("makes package-absolute relationship targets relative to their source part", () => {
    expect(normalizeRelationshipTargets('<Relationship Target="/xl/workbook.xml" />', "_rels/.rels"))
      .toContain('Target="xl/workbook.xml"');
    expect(normalizeRelationshipTargets('<Relationship Target="/xl/worksheets/sheet1.xml" />', "xl/_rels/workbook.xml.rels"))
      .toContain('Target="worksheets/sheet1.xml"');
    expect(normalizeRelationshipTargets('<Relationship Target="/xl/tables/table1.xml" />', "xl/worksheets/_rels/sheet1.xml.rels"))
      .toContain('Target="../tables/table1.xml"');
  });

  it("repairs a workbook using prefixed SpreadsheetML and absolute table targets", async () => {
    const source = new ExcelJS.Workbook();
    const sheet = source.addWorksheet("Companies");
    sheet.addRows([
      ["Company Name", "website", "Email", "Country", "Explanation"],
      ["ACCWING", "https://accwingsail.com", "info@accwingsail.com", "France", "Marine technology"],
    ]);
    sheet.addTable({
      name: "CompaniesTable",
      ref: "A1",
      headerRow: true,
      columns: ["Company Name", "website", "Email", "Country", "Explanation"].map((name) => ({ name })),
      rows: [["ACCWING", "https://accwingsail.com", "info@accwingsail.com", "France", "Marine technology"]],
    });

    const original = Buffer.from(await source.xlsx.writeBuffer());
    const archive = await JSZip.loadAsync(original);
    for (const entry of Object.values(archive.files)) {
      if (entry.dir || !entry.name.endsWith(".xml")) continue;
      const xml = await entry.async("string");
      const prefixed = prefixSpreadsheetElements(xml);
      if (prefixed !== xml) archive.file(entry.name, prefixed);
    }

    const tableRelationships = archive.file("xl/worksheets/_rels/sheet1.xml.rels");
    if (!tableRelationships) throw new Error("Expected worksheet table relationships");
    archive.file(
      tableRelationships.name,
      (await tableRelationships.async("string")).replace('Target="../tables/table1.xml"', 'Target="/xl/tables/table1.xml"'),
    );

    const incompatible = await archive.generateAsync({ type: "nodebuffer" });
    const repaired = await normalizeNamespacedXlsx(incompatible);
    expect(repaired).not.toBeNull();

    const loaded = new ExcelJS.Workbook();
    await loaded.xlsx.load(toArrayBuffer(repaired!));
    expect(loaded.worksheets[0].getCell("A2").text).toBe("ACCWING");
    expect(loaded.worksheets[0].getTable("CompaniesTable")).toBeDefined();
  });
});
