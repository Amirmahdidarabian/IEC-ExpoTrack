import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { SavedClient } from "@/components/SavedClient";

export default function SavedPage() { return <main className="app-page"><Header /><section className="simple-hero"><p className="eyebrow">Your shortlist</p><h1>Saved Exhibitions</h1><p>Keep the events that matter most close at hand.</p></section><div className="page-container content-space"><SavedClient /></div><Footer /></main>; }
