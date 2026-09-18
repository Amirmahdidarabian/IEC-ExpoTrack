"use client";

import { ArrowRight, BarChart3, Plus } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import type { ExhibitionInput } from "@/lib/exhibitions/types";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { ReviewModal } from "@/components/ReviewModal";

export function blankExhibition(): ExhibitionInput {
  return { name: "", tagline: "", industry: "", categoryIds: [], topicIds: [], eventType: "International Exhibition", country: "", countryCode: "", city: "", venue: "", address: "", startDate: "", endDate: null, timezone: "", organizer: "", website: "", description: "", aiReport: "", topics: [], sources: [] };
}

export function HomeClient() {
  const params = useSearchParams();
  const [adding, setAdding] = useState(() => params.get("add") === "manual");
  return <main className="home-page"><Header publicNav /><div className="hero-backdrop" /><section className="home-hero"><div className="home-copy">
    <p className="hero-kicker"><i /> Global exhibition intelligence</p>
    <h1>Build a More Connected<br /><strong>Energy Future</strong></h1>
    <p className="hero-subtitle">Create and manage verified global exhibition records.<br className="desktop-only" /> Use AI only when you want a faster first draft.</p>
    <div className="hero-actions"><button className="button primary hero-add" onClick={() => setAdding(true)}><Plus /> Add New Exhibition <ArrowRight /></button><Link className="button outline hero-view" href="/exhibitions"><BarChart3 /> View All Exhibitions</Link></div>
  </div></section><Footer />
    {adding && <ReviewModal initial={blankExhibition()} mode="manual" onClose={() => { setAdding(false); history.replaceState(null, "", "/"); }} />}
  </main>;
}
