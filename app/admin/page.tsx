import { Permission } from "@prisma/client";
import Link from "next/link";
import { Activity, CalendarPlus, RefreshCw, Users } from "lucide-react";
import { AdminNav } from "@/components/AdminNav";
import { Header } from "@/components/Header";
import { requirePageUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  const user = await requirePageUser(Permission.VIEW_ADMIN_DASHBOARD);
  const start = new Date(); start.setUTCHours(0, 0, 0, 0);
  const [totalUsers, activeUsers, totalExhibitions, addedToday, updatedToday, activity] = await Promise.all([
    prisma.user.count(), prisma.user.count({ where: { isActive: true } }), prisma.exhibition.count(),
    prisma.exhibition.count({ where: { createdAt: { gte: start } } }), prisma.exhibition.count({ where: { updatedAt: { gte: start } } }),
    prisma.auditLog.findMany({ take: 15, orderBy: { createdAt: "desc" }, include: { actor: { select: { username: true } } } }),
  ]);
  const cards = [[Users, "Total Users", totalUsers], [Users, "Active Users", activeUsers], [Activity, "Total Exhibitions", totalExhibitions], [CalendarPlus, "Added Today", addedToday], [RefreshCw, "Updated Today", updatedToday]] as const;
  return <main className="app-page"><Header user={user} /><section className="simple-hero admin-hero"><p className="eyebrow">Administration</p><h1>Operational Dashboard</h1><p>Current IEC ExpoTrack users, exhibitions and accountable activity.</p><AdminNav /></section><div className="page-container admin-content"><section className="admin-metrics">{cards.map(([Icon, label, value]) => <article className="panel" key={label}><Icon /><span><b>{value}</b><small>{label}</small></span></article>)}</section><section className="panel activity-panel"><div className="section-heading"><div><p className="eyebrow">Latest actions</p><h2>Recent Activity</h2></div><Link className="button outline" href="/admin/activity">View all activity</Link></div><div className="activity-list">{activity.map((entry) => <article key={entry.id}><span className="activity-dot" /><div><b>{entry.actor?.username ?? "System"}</b><p>{entry.description}</p>{entry.entityLabel && <small>{entry.entityLabel}</small>}</div><time dateTime={entry.createdAt.toISOString()}>{entry.createdAt.toLocaleString("en-GB", { timeZone: "UTC", dateStyle: "medium", timeStyle: "short" })} UTC</time></article>)}{!activity.length && <p className="muted">No activity has been recorded yet.</p>}</div></section></div></main>;
}
