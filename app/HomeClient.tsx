"use client";

import { ArrowRight, Search, Sparkles } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { FormEvent, useState } from "react";
import type { ExhibitionInput } from "@/lib/exhibitions/types";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Modal } from "@/components/Modal";
import { ReviewModal } from "@/components/ReviewModal";

const blank: ExhibitionInput = { name: "", tagline: "", industry: "Energy", eventType: "International Exhibition", country: "", city: "", venue: "", address: "", startDate: new Date().toISOString().slice(0, 16), endDate: null, timezone: "UTC", organizer: "", website: "", description: "", aiReport: "", topics: [], sources: [] };

export function HomeClient() {
  const params = useSearchParams();
  const [query, setQuery] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "empty" | "none" | "error">("idle");
  const [matches, setMatches] = useState<ExhibitionInput[]>([]);
  const [selected, setSelected] = useState<ExhibitionInput | null>(() => params.get("add") === "manual" ? blank : null);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!query.trim()) { setState("empty"); return; }
    setState("loading");
    try {
      const response = await fetch("/api/exhibitions/search-ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      if (!payload.matches.length) { setState("none"); return; }
      if (payload.matches.length === 1) setSelected(payload.matches[0]); else setMatches(payload.matches);
      setState("idle");
    } catch { setState("error"); }
  }
  return <main className="home-page"><Header publicNav /><div className="hero-backdrop" /><section className="home-hero"><div className="home-copy"><p className="hero-kicker"><i /> Global energy <span>•</span> Trade <span>•</span> Opportunity</p><h1>Search Any Exhibition<br /><strong>Worldwide</strong></h1><p className="hero-subtitle">AI-powered smart search, verification, and automated reporting<br className="desktop-only" /> for global trade shows.</p><form className="hero-search" onSubmit={submit}><Search aria-hidden="true" /><input aria-label="Exhibition search" value={query} onChange={(event) => { setQuery(event.target.value); if (state !== "loading") setState("idle"); }} placeholder="Enter exhibition name, industry, country..." /><Sparkles className="search-spark" /><button className="button primary" disabled={state === "loading"}>{state === "loading" ? "Searching…" : <>Search with AI <ArrowRight /></>}</button></form><div className={`search-message ${state === "error" || state === "empty" ? "error" : ""}`} aria-live="polite">{state === "loading" && "Searching trusted exhibition sources…"}{state === "empty" && "Enter an exhibition name, country, or year."}{state === "none" && "No exhibition found. Try another exhibition name, country, or year."}{state === "error" && "We couldn’t complete the search. Please try again."}</div></div></section><Footer />
    {matches.length > 0 && <Modal onClose={() => setMatches([])} label="Possible exhibitions"><div className="match-picker"><p className="eyebrow">Multiple results</p><h2>We found {matches.length} possible exhibitions</h2><p>Select the exhibition you want to review.</p>{matches.map((match) => <button key={`${match.name}-${match.startDate}`} onClick={() => { setSelected(match); setMatches([]); }}><span><b>{match.name}</b><small>{match.city}, {match.country} · {match.industry}</small></span><ArrowRight /></button>)}</div></Modal>}
    {selected && <ReviewModal initial={selected} mode={params.get("add") === "manual" || !selected.name ? "manual" : "review"} onClose={() => { setSelected(null); history.replaceState(null, "", "/"); }} />}
  </main>;
}
