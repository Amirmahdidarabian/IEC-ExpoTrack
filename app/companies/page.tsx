import { Permission } from "@prisma/client";
import { Building2, Folder, FolderOpen } from "lucide-react";
import { notFound } from "next/navigation";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { CompanyExplorer } from "@/components/companies/CompanyExplorer";
import { CompanyFolderBreadcrumb, CompanyFolders } from "@/components/companies/CompanyFolders";
import { hasPermission } from "@/lib/auth/permissions";
import { requirePageUser } from "@/lib/auth/session";
import { parseCompanyQuery } from "@/lib/companies/query";
import { listCompanies } from "@/lib/companies/repository";
import { listCompanyFolders } from "@/lib/companies/folders";

export const dynamic = "force-dynamic";

export default async function CompaniesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePageUser(Permission.VIEW_COMPANIES);
  const params = await searchParams; const query = parseCompanyQuery(params);
  // Plain navigation opens folders. Preserve saved/deep links and existing filtered URLs.
  const showList = Boolean(query.folder || Object.keys(params).some((key) => key !== "folder"));
  if (showList && !query.folder) query.folder = "all";
  const overview = await listCompanyFolders();
  const folder = overview.folders.find((item) => item.id === query.folder);
  if (query.folder && !["all", "unfiled"].includes(query.folder) && !folder) notFound();
  const result = showList ? await listCompanies(query) : null;
  const name = folder?.name ?? (query.folder === "unfiled" ? "Without a folder" : "All companies");
  const abilities = { canCreate: hasPermission(user, Permission.CREATE_COMPANIES), canUpdate: hasPermission(user, Permission.UPDATE_COMPANIES), canDelete: hasPermission(user, Permission.DELETE_COMPANIES), canImport: hasPermission(user, Permission.IMPORT_COMPANIES), canCreateExhibition: hasPermission(user, Permission.CREATE_EXHIBITIONS) };
  return <main className="app-page companies-page"><Header user={user} /><section className="database-hero company-hero"><div><p className="eyebrow">Global company intelligence</p><h1>{showList ? name : "Companies"} <small>{(result?.total ?? overview.total).toLocaleString()} companies</small></h1><p>{folder?.description || (showList ? "Manage company intelligence, contacts and connections." : "Organize your company network into focused collections.")}</p></div><div className="stat-cards"><div><Building2 /><span><b>{overview.total.toLocaleString()}</b><small>Total companies</small></span></div><div><Folder /><span><b>{overview.folders.length}</b><small>Company folders</small></span></div><div><FolderOpen /><span><b>{overview.unfiled.toLocaleString()}</b><small>Without a folder</small></span></div></div></section><div className="page-container companies-container">{result ? <><CompanyFolderBreadcrumb name={name} /><CompanyExplorer result={result} query={query} folderOptions={overview.folders} {...abilities} /></> : <CompanyFolders {...overview} canManage={abilities.canUpdate} />}</div><Footer /></main>;
}

