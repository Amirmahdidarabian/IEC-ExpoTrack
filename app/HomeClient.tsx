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

export function HomeClient({ user }: { user: { username: string; role: string; permissions: string[] } | null }) {
  const params = useSearchParams();
  const [adding, setAdding] = useState(() => params.get("add") === "manual");
  const canCreate = user?.role === "ADMIN" || user?.permissions.includes("CREATE_EXHIBITIONS");
  return <main className="home-page"><Header publicNav user={user} /><div className="hero-backdrop" /><section className="home-hero"><div className="home-copy">
    <p className="hero-kicker"><i /> Global exhibition intelligence</p>
    <h1>International <strong>Energy Club</strong></h1>
    <p className="hero-subtitle">Global Authority in Offshore<br className="desktop-only" /> &amp; Energy Visualization</p>
    <div className="hero-actions">{canCreate ? <button className="button primary hero-add" onClick={() => setAdding(true)}><Plus /> Add New Exhibition <ArrowRight /></button> : <Link className="button primary hero-add" href="/login"><Plus /> Sign in to Manage <ArrowRight /></Link>}<Link className="button outline hero-view" href="/exhibitions"><BarChart3 /> View All Exhibitions</Link></div>
  </div></section><Footer />
    {adding && canCreate && <ReviewModal initial={blankExhibition()} mode="manual" onClose={() => { setAdding(false); history.replaceState(null, "", "/"); }} />}
  </main>;
}
