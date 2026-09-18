import { seedExhibitions } from "./seed-data";
import { normalizeDateOnly } from "./dates";
import { aiExhibitionSchema } from "./schema";
import type { ExhibitionInput } from "./types";

export type AiSearchResult = { matches: Partial<ExhibitionInput>[]; provider: "openai" | "demo" };

function toInput(match: (typeof seedExhibitions)[number]): Partial<ExhibitionInput> {
  return {
    name: match.name, tagline: match.tagline, eventType: match.eventType, venue: match.venue, address: match.address,
    startDate: match.startDate, endDate: match.endDate, organizer: match.organizer,
    website: match.website, description: match.description, aiReport: match.aiReport,
    sources: match.sources.map((source) => ({ label: source.label, url: source.url, lastChecked: source.lastChecked, priority: source.priority })),
  };
}

async function searchWithOpenAI(query: string): Promise<AiSearchResult | null> {
  if (!process.env.OPENAI_API_KEY) return null;
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL ?? "gpt-5-mini",
      input: `Research this exhibition: ${query}. Return one best factual result as JSON with fields name, tagline, eventType, venue, address, startDate ISO, endDate ISO or null, organizer, website https URL, description, aiReport, and sources array with label,url,lastChecked ISO,priority number. Do not infer country, city, category, topic, or timezone; those are selected from deterministic databases in the application. If uncertain return {\"matches\":[]}. Wrap the result as {\"matches\":[result]}. Do not invent dates.`,
    }),
  });
  if (!response.ok) throw new Error("Research provider unavailable");
  const payload = await response.json() as { output_text?: string; output?: Array<{ content?: Array<{ text?: string }> }> };
  const text = payload.output_text ?? payload.output?.flatMap((entry) => entry.content ?? []).map((entry) => entry.text ?? "").join("") ?? "";
  const parsed = JSON.parse(text.replace(/^```json\s*|\s*```$/g, "")) as { matches?: unknown[] };
  const matches = (parsed.matches ?? []).flatMap((candidate) => {
    const result = aiExhibitionSchema.safeParse(candidate);
    if (!result.success) return [];
    return [{ ...result.data, startDate: result.data.startDate ? normalizeDateOnly(result.data.startDate) ?? undefined : undefined, endDate: result.data.endDate ? normalizeDateOnly(result.data.endDate) : result.data.endDate }];
  });
  return { matches, provider: "openai" };
}

export async function searchExhibitionsWithAI(query: string): Promise<AiSearchResult> {
  const normalized = query.trim().toLowerCase();
  if (normalized.length < 2) return { matches: [], provider: "demo" };
  try {
    const live = await searchWithOpenAI(query);
    if (live) return live;
  } catch (error) {
    console.error("OpenAI exhibition search failed; using verified demo catalog", error);
  }
  const tokens = normalized.split(/\s+/).filter((token) => token.length > 1);
  const matches = seedExhibitions.filter((item) => {
    const text = [item.name, item.city, item.country, item.industry, ...item.topics].join(" ").toLowerCase();
    return tokens.every((token) => text.includes(token)) || item.name.toLowerCase().includes(normalized);
  }).slice(0, 3).map(toInput);
  return { matches, provider: "demo" };
}
