import { createHash } from "node:crypto";
import { normalizeCompanyName } from "@/lib/companies/normalization";

export const normalizedMediaName = normalizeCompanyName;
export function cleanText(value: string) { return value.normalize("NFKC").trim().replace(/\s+/g, " "); }
export function normalizeMediaUrl(value?: string | null) {
  if (!value?.trim()) return null;
  const raw = value.trim();
  if (/^[a-z][a-z\d+.-]*:/i.test(raw) && !/^https?:\/\//i.test(raw)) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || !url.hostname.includes(".") || /\s/.test(raw)) return null;
    url.hash = "";
    return url.href;
  } catch { return null; }
}
export function mediaIdentity(name: string, website?: string | null) {
  const normalized = normalizeMediaUrl(website);
  const url = normalized ? new URL(normalized) : null;
  if (url) url.searchParams.sort();
  const identity = url ? `${url.host.toLowerCase().replace(/^www\./, "")}${url.pathname.replace(/\/+$/, "")}${url.search}` : "";
  return createHash("sha256").update(`${normalizedMediaName(name)}\n${identity}`).digest("hex");
}
export function contactImportKey(label: string | null, method: string, value: string | null) {
  return createHash("sha256").update(JSON.stringify([cleanText(label ?? "").toLowerCase(), method, cleanText(value ?? "").toLowerCase()])).digest("hex");
}
export const conservativeCategoryName = (value: string) => cleanText(value).toLowerCase().replace(/\s*&\s*/g, " & ");
