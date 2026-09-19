import { Permission } from "@prisma/client";
import { Building2, CalendarDays, Globe2 } from "lucide-react";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { ExhibitionExplorer } from "@/components/ExhibitionExplorer";
import { hasPermission } from "@/lib/auth/permissions";
import { requirePageUser } from "@/lib/auth/session";
import { listExhibitions } from "@/lib/exhibitions/repository";
import type { SortKey, StatusKey } from "@/lib/exhibitions/types";

export const dynamic = "force-dynamic";

export default async function ExhibitionsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePageUser(Permission.VIEW_EXHIBITIONS);
  const p = await searchParams; const get = (key: string) => typeof p[key] === "string" ? p[key] as string : undefined;
  const result = await listExhibitions({ q: get("q"), country: get("country"), industry: get("industry"), year: get("year"), topic: get("topic"), status: (get("status") ?? "all") as StatusKey, sort: (get("sort") ?? "nearest") as SortKey, page: Number(get("page") ?? 1), pageSize: Number(get("pageSize") ?? 5) });
  const abilities = { canUpdate: hasPermission(user, Permission.UPDATE_EXHIBITIONS), canDelete: hasPermission(user, Permission.DELETE_EXHIBITIONS) };
  return <main className="app-page"><Header user={user} /><section className="database-hero"><div><p className="eyebrow">Global exhibition intelligence</p><h1>All Exhibitions</h1><p>Explore the world’s leading energy exhibitions, trade shows and conferences.</p></div><div className="stat-cards"><div><CalendarDays /><span><b>{result.stats.total}</b><small>Total Exhibitions</small></span></div><div><Globe2 /><span><b>{result.stats.countries}</b><small>Countries</small></span></div><div><Building2 /><span><b>{result.stats.industries}</b><small>Industries</small></span></div></div></section><div className="page-container"><ExhibitionExplorer result={result} {...abilities} /></div><Footer /></main>;
}
