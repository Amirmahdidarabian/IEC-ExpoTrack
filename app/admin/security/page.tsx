import { AlertTriangle, CheckCircle2, CircleHelp, ShieldCheck, XCircle } from "lucide-react";
import { AdminNav } from "@/components/AdminNav";
import { Header } from "@/components/Header";
import { requireAdminPageUser } from "@/lib/auth/session";
import { getSecurityStatus, type SecurityState } from "@/lib/security/status";

export const dynamic = "force-dynamic";

const icons = { PASS: CheckCircle2, WARNING: AlertTriangle, FAIL: XCircle, UNKNOWN: CircleHelp };

export default async function SecurityPage() {
  const user = await requireAdminPageUser();
  const report = await getSecurityStatus();
  return <main className="app-page"><Header user={user} /><section className="simple-hero admin-hero"><p className="eyebrow">Administration</p><h1>System &amp; Security</h1><p>Production readiness, configuration health and security status.</p><AdminNav /></section><div className="page-container admin-content security-page"><section className={`panel readiness-card ${report.readiness.toLowerCase().replaceAll(" ", "-")}`}><ShieldCheck /><div><p className="eyebrow">Production Readiness</p><h2>{report.readiness}</h2><p>{report.readiness === "READY" ? "All critical application checks passed." : report.readiness === "NOT READY" ? "One or more critical requirements must be fixed before production use." : "The code is prepared, but configuration or external infrastructure still needs verification."}</p></div></section>{report.sections.map((section) => <section className="panel security-section" key={section.title}><div className="section-heading"><div><p className="eyebrow">Security health</p><h2>{section.title}</h2></div></div><div className="security-status-list">{section.items.map((item) => <StatusRow key={item.label} {...item} />)}</div></section>)}</div></main>;
}

function StatusRow({ label, state, summary }: { label: string; state: SecurityState; summary: string }) {
  const Icon = icons[state];
  return <article className={`security-status ${state.toLowerCase()}`}><Icon aria-hidden="true" /><div><h3>{label}</h3><p>{summary}</p></div><strong>{state}</strong></article>;
}
