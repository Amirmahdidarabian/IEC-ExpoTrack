import { Permission } from "@prisma/client";
import { Building2, Factory, Globe2 } from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { CompanyExplorer } from "@/components/companies/CompanyExplorer";
import { hasPermission } from "@/lib/auth/permissions";
import { requirePageUser } from "@/lib/auth/session";
import { parseCompanyQuery } from "@/lib/companies/query";
import { listCompanies } from "@/lib/companies/repository";

export const dynamic = "force-dynamic";

export default async function CompaniesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePageUser(Permission.VIEW_COMPANIES); const params = await searchParams; const query = parseCompanyQuery(params); const result = await listCompanies(query);
  const abilities = { canCreate: hasPermission(user, Permission.CREATE_COMPANIES), canUpdate: hasPermission(user, Permission.UPDATE_COMPANIES), canDelete: hasPermission(user, Permission.DELETE_COMPANIES), canImport: hasPermission(user, Permission.IMPORT_COMPANIES), canCreateExhibition: hasPermission(user, Permission.CREATE_EXHIBITIONS) };
  return <main className="app-page companies-page"><Header user={user} /><section className="database-hero company-hero"><div><p className="eyebrow">Global company intelligence</p><h1>Companies <small>{result.stats.total.toLocaleString()} companies</small></h1><p>Discover and manage companies in the global energy industry.</p></div><div className="stat-cards"><div><Building2 /><span><b>{result.stats.total.toLocaleString()}</b><small>Total Companies</small></span></div><div><Globe2 /><span><b>{result.stats.countries.toLocaleString()}</b><small>Countries</small></span></div><div><Factory /><span><b>{result.stats.industries.toLocaleString()}</b><small>Categories</small></span></div></div></section><div className="page-container companies-container"><CompanyExplorer result={result} query={query} {...abilities} /></div><Footer /></main>;
}

