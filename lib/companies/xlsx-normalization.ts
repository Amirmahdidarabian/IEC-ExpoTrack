import JSZip from "jszip";
import { posix } from "node:path";

const MAX_ARCHIVE_ENTRIES = 2048;
const MAX_XML_TEXT_BYTES = 64 * 1024 * 1024;
const SPREADSHEETML_NAMESPACES = new Set([
  "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
  "http://purl.oclc.org/ooxml/spreadsheetml/main",
]);

export function normalizeSpreadsheetXml(xml: string) {
  const namespace = xml.match(/\sxmlns:x=(?:"([^"]*)"|'([^']*)')/)?.slice(1).find(Boolean);
  if (!namespace || !SPREADSHEETML_NAMESPACES.has(namespace)) return xml;

  return xml
    .replace(/(<\/?)(?:x):/g, "$1")
    .replace(/\sxmlns:x=("[^"]*"|'[^']*')/g, " xmlns=$1");
}

export function normalizeRelationshipTargets(xml: string, relationshipPath: string) {
  const marker = "/_rels/";
  const markerAt = relationshipPath.lastIndexOf(marker);
  const sourcePart = relationshipPath === "_rels/.rels"
    ? ""
    : markerAt >= 0
      ? `${relationshipPath.slice(0, markerAt)}/${relationshipPath.slice(markerAt + marker.length, -".rels".length)}`
      : "";
  const sourceDirectory = sourcePart ? posix.dirname(sourcePart) : "";

  return xml.replace(/Target=("|')\/([^"']+)\1/g, (_match, quote: string, absoluteTarget: string) => {
    const relative = sourceDirectory ? posix.relative(sourceDirectory, absoluteTarget) : absoluteTarget;
    return `Target=${quote}${relative}${quote}`;
  });
}

/**
 * Some standards-compliant generators use an explicit `x:` prefix for the
 * SpreadsheetML namespace. ExcelJS expects the same namespace as the default
 * namespace in a few workbook parsers. Normalize only XML element prefixes;
 * cell values, formulas, relationship attributes, and binary parts are left
 * untouched.
 */
export async function normalizeNamespacedXlsx(buffer: Buffer) {
  const archive = await JSZip.loadAsync(buffer);
  const entries = Object.values(archive.files);
  if (entries.length > MAX_ARCHIVE_ENTRIES) throw new Error("Workbook contains too many archive entries.");

  let expandedBytes = 0;
  let changed = false;
  for (const entry of entries) {
    const lowerName = entry.name.toLocaleLowerCase("en-US");
    if (entry.dir || (!lowerName.endsWith(".xml") && !lowerName.endsWith(".rels"))) continue;

    const xml = await entry.async("string");
    expandedBytes += Buffer.byteLength(xml, "utf8");
    if (expandedBytes > MAX_XML_TEXT_BYTES) throw new Error("Workbook XML content is too large.");

    const normalized = lowerName.endsWith(".rels")
      ? normalizeRelationshipTargets(normalizeSpreadsheetXml(xml), entry.name)
      : normalizeSpreadsheetXml(xml);
    if (normalized !== xml) {
      archive.file(entry.name, normalized);
      changed = true;
    }
  }

  return changed ? archive.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }) : null;
}

