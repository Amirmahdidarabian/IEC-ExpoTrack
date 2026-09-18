import type { Exhibition, ExhibitionInput } from "./types";

const noiseWords = new Set(["exhibition", "expo", "conference", "event", "trade", "show", "international"]);

export function normalizeExhibitionName(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9\p{L}]+/gu, " ").trim().split(/\s+/).filter((token) => token && !noiseWords.has(token)).join(" ");
}

function yearOf(value: Pick<ExhibitionInput, "name" | "startDate">) {
  const named = value.name.match(/\b(19|20)\d{2}\b/)?.[0];
  return named ?? (value.startDate ? String(new Date(value.startDate).getUTCFullYear()) : "");
}

function nameWithoutYear(value: string) {
  return normalizeExhibitionName(value).replace(/\b(19|20)\d{2}\b/g, "").replace(/\s+/g, " ").trim();
}

function sameText(a: string, b: string) { return Boolean(a.trim() && b.trim() && a.trim().toLowerCase() === b.trim().toLowerCase()); }

export function duplicateScore(existing: Exhibition, incoming: ExhibitionInput) {
  const existingName = normalizeExhibitionName(existing.name);
  const incomingName = normalizeExhibitionName(incoming.name);
  const exactNormalizedName = existingName === incomingName;
  const sameSeries = nameWithoutYear(existing.name) === nameWithoutYear(incoming.name);
  const existingYear = yearOf(existing);
  const incomingYear = yearOf(incoming);
  const sameYear = Boolean(existingYear && existingYear === incomingYear);
  let score = exactNormalizedName ? 60 : sameSeries ? 38 : 0;
  if (sameYear) score += 22;
  else if (existingYear && incomingYear && existingYear !== incomingYear) score -= 30;
  if (sameText(existing.country, incoming.country)) score += 10;
  if (sameText(existing.city, incoming.city)) score += 4;
  if (sameText(existing.venue, incoming.venue)) score += 4;
  if (sameText(existing.organizer, incoming.organizer)) score += 4;
  const dateDistance = Math.abs(new Date(existing.startDate).getTime() - new Date(incoming.startDate).getTime()) / 86_400_000;
  if (Number.isFinite(dateDistance) && dateDistance <= 14) score += 8;
  return Math.max(0, Math.min(100, score));
}

export function findLikelyDuplicates(items: Exhibition[], incoming: ExhibitionInput) {
  return items.map((item) => ({ item, score: duplicateScore(item, incoming) })).filter((candidate) => candidate.score >= 65).sort((a, b) => b.score - a.score).map(({ item, score }) => ({ ...item, duplicateScore: score }));
}
