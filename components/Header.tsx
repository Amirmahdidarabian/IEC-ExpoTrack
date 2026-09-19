"use client";

import Link from "next/link";
import { ChevronDown, CircleUserRound, LogOut, Plus, Settings, ShieldCheck } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Brand } from "./Brand";

const links = [
  ["/", "Home"], ["/exhibitions", "Exhibitions"], ["/saved", "Saved"],
];

type HeaderUser = { username: string; role: string; permissions: string[] };

export function Header({ publicNav = false, user }: { publicNav?: boolean; user?: HeaderUser | null }) {
  const pathname = usePathname();
  const router = useRouter();
  const [accountOpen, setAccountOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const canCreate = user?.role === "ADMIN" || user?.permissions.includes("CREATE_EXHIBITIONS");
  const canAdmin = user?.role === "ADMIN" || user?.permissions.some((item) => ["VIEW_ADMIN_DASHBOARD", "MANAGE_USERS", "VIEW_AUDIT_LOGS"].includes(item));
  const adminHref = user?.role === "ADMIN" || user?.permissions.includes("VIEW_ADMIN_DASHBOARD") ? "/admin" : user?.permissions.includes("MANAGE_USERS") ? "/admin/users" : "/admin/activity";
  const shown = publicNav ? links.filter(([, label]) => ["Home", "Exhibitions"].includes(label)) : links.filter(([, label]) => label !== "Home");
  async function logout() { await fetch("/api/auth/logout", { method: "POST" }); router.replace("/login"); router.refresh(); }
  return (
    <header className="site-header" ref={headerRef}>
      <Brand />
      <button className="mobile-menu" onClick={() => setMobileOpen((v) => !v)} aria-label="Toggle navigation"><span /><span /><span /></button>
      <nav className={mobileOpen ? "main-nav open" : "main-nav"} aria-label="Primary navigation">
        {shown.map(([href, label]) => <Link onClick={() => setMobileOpen(false)} key={href} className={pathname === href || (href !== "/" && pathname.startsWith(href)) ? "active" : ""} href={href}>{label}</Link>)}
        {!publicNav && canAdmin && <Link onClick={() => setMobileOpen(false)} className={pathname.startsWith("/admin") ? "active" : ""} href={adminHref}>Administration</Link>}
        {publicNav && <a href="mailto:hello@internationalenergy.club">Contact</a>}
      </nav>
      {!publicNav && user && <div className="header-actions">
        <div className="account-wrap"><button className="account-button" onClick={() => setAccountOpen((v) => !v)}><CircleUserRound /><span>{user.username}</span><ChevronDown size={15} /></button>{accountOpen && <div className="mini-popover account-popover"><strong>{user.username}</strong><span>{user.role === "ADMIN" ? "Administrator" : "IEC employee"}</span><Link href="/settings/account"><Settings /> Account settings</Link>{canAdmin && <Link href={adminHref}><ShieldCheck /> Administration</Link>}<button onClick={logout}><LogOut /> Sign out</button></div>}</div>
        {canCreate && <Link href="/?add=manual" className="button outline add-button"><Plus size={19} /> Add Exhibition</Link>}
      </div>}
    </header>
  );
}
