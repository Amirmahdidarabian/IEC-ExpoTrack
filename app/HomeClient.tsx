"use client";

import { Bell, Bookmark, CalendarDays, ChevronDown, Home, LogOut, Menu, Plus, Search, Settings, ShieldCheck, UserRound, X } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Brand } from "@/components/Brand";
import { ThemeToggle } from "@/components/ThemeToggle";
import { UpcomingExhibitionDeck } from "@/components/home/UpcomingExhibitionDeck";
import { ReviewModal } from "@/components/ReviewModal";
import type { Exhibition, ExhibitionInput } from "@/lib/exhibitions/types";

type HomeUser = { username: string; role: string; permissions: string[] };

export function blankExhibition(): ExhibitionInput {
  return { name: "", tagline: "", industry: "", categoryIds: [], topicIds: [], eventType: "International Exhibition", country: "", countryCode: "", city: "", venue: "", address: "", startDate: "", endDate: null, timezone: "", organizer: "", website: "", exhibitorListUrl: "", description: "", aiReport: "", topics: [], sources: [] };
}

function PublicHome() {
  return <main className="home-page public-home">
    <div className="hero-backdrop" aria-hidden="true" />
    <header className="home-public-header"><Brand home /><div><ThemeToggle /><Link className="home-login" href="/login"><UserRound aria-hidden="true" /> Log in</Link></div></header>
    <section className="home-hero" aria-labelledby="public-home-title"><div className="home-copy">
      <p className="hero-kicker"><i /> Global exhibition intelligence</p>
      <h1 id="public-home-title"><span>Global <em>Energy</em></span><span><em className="magenta">Exhibition</em></span><span>Database</span></h1>
      <p className="hero-subtitle">Global Authority in Offshore<br /> &amp; Energy Visualization</p>
    </div></section>
    <footer className="home-public-footer"><span><Brand compact /> Global Energy Exhibition Database <small>Connecting energy markets</small></span><a href="mailto:hello@internationalenergy.club">Contact &amp; Help</a></footer>
  </main>;
}

function DashboardHome({ user, exhibitions, asOf, canView, onAdd }: { user: HomeUser; exhibitions: Exhibition[]; asOf: string; canView: boolean; onAdd: () => void }) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [noticesOpen, setNoticesOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const canCreate = user.role === "ADMIN" || user.permissions.includes("CREATE_EXHIBITIONS");
  const canAdmin = user.role === "ADMIN" || user.permissions.some((item) => ["VIEW_ADMIN_DASHBOARD", "MANAGE_USERS", "VIEW_AUDIT_LOGS"].includes(item));
  const initials = user.username.slice(0, 2).toUpperCase();
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); searchRef.current?.focus(); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
  async function logout() { await fetch("/api/auth/logout", { method: "POST" }); router.replace("/login"); router.refresh(); }

  const nav = [
    { href: "/", label: "Home", icon: Home },
    { href: "/exhibitions", label: "Exhibitions", icon: CalendarDays },
    { href: "/saved", label: "Saved", icon: Bookmark },
  ];

  return <main className="home-page dashboard-home">
    <div className="hero-backdrop" aria-hidden="true" />
    <aside className={`home-rail${menuOpen ? " is-open" : ""}`} aria-label="Dashboard navigation">
      <button className="home-rail-menu" aria-label={menuOpen ? "Close navigation" : "Open navigation"} aria-expanded={menuOpen} onClick={() => setMenuOpen((value) => !value)}>{menuOpen ? <X /> : <Menu />}</button>
      <nav aria-label="Main navigation">{nav.map(({ href, label, icon: Icon }) => <Link key={href} href={href} className={href === "/" ? "active" : ""} aria-current={href === "/" ? "page" : undefined} onClick={() => setMenuOpen(false)}><Icon aria-hidden="true" /><span>{label}</span></Link>)}
        <button type="button" onClick={() => { setNoticesOpen(true); setMenuOpen(false); }}><Bell aria-hidden="true" /><span>Notifications</span></button>
        <Link href="/settings/account" onClick={() => setMenuOpen(false)}><Settings aria-hidden="true" /><span>Settings</span></Link>
      </nav>
    </aside>
    <div className="home-dashboard-body">
      <header className="home-dashboard-header">
        <Brand home />
        <form className="home-dashboard-search" action="/exhibitions" role="search"><Search aria-hidden="true" /><input ref={searchRef} name="q" type="search" placeholder="Search exhibitions, location, or industry..." aria-label="Search exhibitions, location, or industry" /><kbd>Ctrl K</kbd></form>
        <div className="home-dashboard-controls"><ThemeToggle />
          <div className="home-notification-wrap"><button type="button" className="home-icon-control" aria-label="Notifications" aria-expanded={noticesOpen} onClick={() => setNoticesOpen((value) => !value)}><Bell aria-hidden="true" /></button>{noticesOpen && <div className="home-notification-popover" role="status"><strong>Notifications</strong><p>No new notifications.</p><button type="button" onClick={() => setNoticesOpen(false)}>Close</button></div>}</div>
          <details className="home-profile"><summary aria-label={`Account menu for ${user.username}`}><span className="home-avatar">{initials}</span><ChevronDown aria-hidden="true" /></summary><div className="home-profile-menu"><strong>{user.username}</strong><small>{user.role === "ADMIN" ? "Administrator" : "IEC employee"}</small><Link href="/settings/account"><Settings /> Account settings</Link>{canAdmin && <Link href="/admin"><ShieldCheck /> Administration</Link>}{canCreate && <button type="button" onClick={onAdd}><Plus /> Add Exhibition</button>}<button type="button" onClick={logout}><LogOut /> Sign out</button></div></details>
        </div>
      </header>
      <section className="home-dashboard-main" aria-labelledby="upcoming-title"><div className="home-dashboard-intro"><p className="hero-kicker"><i /> Global exhibition intelligence</p><h1 id="upcoming-title">Upcoming exhibitions</h1><p>Track the nearest energy exhibitions worldwide.</p></div>
        {canView ? <UpcomingExhibitionDeck exhibitions={exhibitions} asOf={asOf} /> : <div className="home-deck-empty">Your account does not have access to exhibitions.</div>}
      </section>
    </div>
  </main>;
}

export function HomeClient({ user, exhibitions, asOf, canView }: { user: HomeUser | null; exhibitions: Exhibition[]; asOf: string; canView: boolean }) {
  const params = useSearchParams();
  const [adding, setAdding] = useState(() => params.get("add") === "manual");
  const canCreate = user?.role === "ADMIN" || user?.permissions.includes("CREATE_EXHIBITIONS");
  if (!user) return <PublicHome />;
  return <><DashboardHome user={user} exhibitions={exhibitions} asOf={asOf} canView={canView} onAdd={() => setAdding(true)} />
    {adding && canCreate && <ReviewModal initial={blankExhibition()} mode="manual" onClose={() => { setAdding(false); history.replaceState(null, "", "/"); }} />}
  </>;
}
