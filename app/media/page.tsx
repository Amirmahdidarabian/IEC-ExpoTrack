import { Permission } from "@prisma/client";
import { Globe2, Mail, Newspaper } from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { requirePageUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { listMedia, mediaOptions } from "@/lib/media/repository";
import { parseMediaQuery } from "@/lib/media/query";
import type { MediaList } from "@/lib/media/types";
import { MediaExplorer } from "@/components/media/MediaExplorer";
export const dynamic="force-dynamic";
export default async function MediaPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
  const user=await requirePageUser(Permission.VIEW_MEDIA),params=await searchParams;
  let query;try{query=parseMediaQuery(params);}catch{query=parseMediaQuery({});}
  const [result,options]=await Promise.all([listMedia(query),mediaOptions()]);
  const abilities={canCreate:hasPermission(user,Permission.CREATE_MEDIA),canUpdate:hasPermission(user,Permission.UPDATE_MEDIA),canDelete:hasPermission(user,Permission.DELETE_MEDIA),canImport:hasPermission(user,Permission.IMPORT_MEDIA),canManageTaxonomy:hasPermission(user,Permission.UPDATE_COMPANIES)||hasPermission(user,Permission.UPDATE_EXHIBITIONS)};
  return <main className="app-page media-page"><Header user={user}/><section className="database-hero"><div><p className="eyebrow">Global media database</p><h1>Media</h1><p>Manage international publications, editorial contacts, and media coverage.</p></div><div className="stat-cards">{[[Newspaper,result.stats.outlets,"Media Outlets"],[Mail,result.stats.contacts,"Contacts"],[Globe2,result.stats.locations,"Countries / Regions"]].map(([Icon,value,label])=>{const I=Icon as typeof Newspaper;return <div key={String(label)}><I/><span><b>{Number(value).toLocaleString()}</b><small>{String(label)}</small></span></div>;})}</div></section><div className="page-container media-container"><MediaExplorer result={JSON.parse(JSON.stringify(result)) as MediaList} options={options} query={query} abilities={abilities}/></div><Footer/></main>;
}
