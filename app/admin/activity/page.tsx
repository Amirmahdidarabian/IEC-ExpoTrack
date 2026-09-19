import { AuditAction, Permission, Prisma } from "@prisma/client";
import Link from "next/link";
import { AdminNav } from "@/components/AdminNav";
import { Header } from "@/components/Header";
import { requirePageUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 25;

export default async function ActivityPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePageUser(Permission.VIEW_AUDIT_LOGS); const p = await searchParams; const page = Math.max(1, Number(p.page) || 1);
  const action = Object.values(AuditAction).includes(p.action as AuditAction) ? p.action as AuditAction : undefined;
  const from = /^\d{4}-\d{2}-\d{2}$/.test(p.from ?? "") ? p.from : undefined; const to = /^\d{4}-\d{2}-\d{2}$/.test(p.to ?? "") ? p.to : undefined;
  const where: Prisma.AuditLogWhereInput = { actorUserId: p.user || undefined, action, createdAt: from || to ? { gte: from ? new Date(`${from}T00:00:00.000Z`) : undefined, lte: to ? new Date(`${to}T23:59:59.999Z`) : undefined } : undefined };
  const [entries, total, users] = await Promise.all([
    prisma.auditLog.findMany({ where, take: PAGE_SIZE, skip: (page - 1) * PAGE_SIZE, orderBy: { createdAt: "desc" }, include: { actor: { select: { username: true } } } }),
    prisma.auditLog.count({ where }), prisma.user.findMany({ select: { id: true, username: true }, orderBy: { username: "asc" } }),
  ]);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE)); const query = (next: number) => { const params = new URLSearchParams(Object.entries(p).filter((entry): entry is [string, string] => Boolean(entry[1]))); params.set("page", String(next)); return `?${params}`; };
  return <main className="app-page"><Header user={user} /><section className="simple-hero admin-hero"><p className="eyebrow">Administration</p><h1>Activity Logs</h1><p>Immutable, server-recorded operational history.</p><AdminNav /></section><div className="page-container admin-content"><form className="audit-filters panel"><label>User<select name="user" defaultValue={p.user ?? ""}><option value="">All users</option>{users.map((item) => <option value={item.id} key={item.id}>{item.username}</option>)}</select></label><label>Action<select name="action" defaultValue={action ?? ""}><option value="">All actions</option>{Object.values(AuditAction).map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</select></label><label>From<input name="from" type="date" defaultValue={p.from} /></label><label>To<input name="to" type="date" defaultValue={p.to} /></label><button className="button primary">Apply filters</button><Link className="button outline" href="/admin/activity">Clear</Link></form><section className="panel admin-table audit-table"><div className="admin-table-head"><span>User</span><span>Action</span><span>Entity</span><span>Description</span><span>Date &amp; Time</span></div>{entries.map((entry) => <article key={entry.id}><span>{entry.actor?.username ?? "System"}</span><b>{entry.action.replaceAll("_", " ")}</b><span>{entry.entityLabel ?? entry.entityType}</span><span>{entry.description}</span><time>{entry.createdAt.toLocaleString("en-GB", { timeZone: "UTC", dateStyle: "medium", timeStyle: "medium" })} UTC</time></article>)}{!entries.length && <p className="empty-copy">No matching activity.</p>}</section><nav className="pagination"><span>{total} records</span><div><Link aria-disabled={page <= 1} href={query(page - 1)}>Previous</Link><b>Page {page} of {pageCount}</b><Link aria-disabled={page >= pageCount} href={query(page + 1)}>Next</Link></div></nav></div></main>;
}
