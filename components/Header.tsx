"use client";

import Link from "next/link";
import { Bell, ChevronDown, CircleUserRound, Plus } from "lucide-react";
import { usePathname } from "next/navigation";
import { useRef, useState } from "react";
import { Brand } from "./Brand";

const links = [
  ["/", "Home"], ["/exhibitions", "Exhibitions"], ["/saved", "Saved"], ["/reports", "Reports"], ["/resources", "Resources"], ["/about", "About"],
];

export function Header({ publicNav = false }: { publicNav?: boolean }) {
  const pathname = usePathname();
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const shown = publicNav ? links.filter(([, label]) => ["Home", "Exhibitions", "About", "Resources"].includes(label)) : links.filter(([, label]) => label !== "Home");
  return (
    <header className="site-header" ref={headerRef}>
      <Brand />
      <button className="mobile-menu" onClick={() => setMobileOpen((v) => !v)} aria-label="Toggle navigation"><span /><span /><span /></button>
      <nav className={mobileOpen ? "main-nav open" : "main-nav"} aria-label="Primary navigation">
        {shown.map(([href, label]) => <Link onClick={() => setMobileOpen(false)} key={href} className={pathname === href || (href !== "/" && pathname.startsWith(href)) ? "active" : ""} href={href}>{label}</Link>)}
        {publicNav && <a href="mailto:hello@internationalenergy.club">Contact</a>}
      </nav>
      {!publicNav && <div className="header-actions">
        <div className="pop-wrap"><button className="icon-button notification-button" onClick={() => setNoticeOpen((v) => !v)} aria-label="Notifications"><Bell size={21} /><i /></button>{noticeOpen && <div className="mini-popover">No new notifications</div>}</div>
        <div className="account-wrap"><button className="account-button" onClick={() => setAccountOpen((v) => !v)}><CircleUserRound /><span>My Account</span><ChevronDown size={15} /></button>{accountOpen && <div className="mini-popover account-popover"><strong>IEC Viewer</strong><span>Guest workspace</span></div>}</div>
        <Link href="/?add=manual" className="button outline add-button"><Plus size={19} /> Add Exhibition</Link>
      </div>}
    </header>
  );
}
