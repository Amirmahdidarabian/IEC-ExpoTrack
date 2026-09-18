import { Header } from "@/components/Header";
import Link from "next/link";
export default function NotFound() { return <main className="app-page"><Header /><div className="not-found"><p className="eyebrow">404</p><h1>Exhibition not found</h1><p>The record may have moved or been removed.</p><Link className="button primary" href="/exhibitions">Browse Exhibitions</Link></div></main>; }
