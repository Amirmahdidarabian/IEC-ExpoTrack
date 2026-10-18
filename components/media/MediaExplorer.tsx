"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useEffectEvent, useState, useTransition } from "react";
import { FileSpreadsheet, Newspaper, Plus, Search, SlidersHorizontal, X } from "lucide-react";
import type { MediaAbilities, MediaDetail, MediaList, MediaOptions } from "@/lib/media/types";
import type { MediaQuery } from "@/lib/media/query";
import { MediaDrawer, MediaConfirm, mediaTabs } from "./MediaDrawer";
import { MediaForm } from "./MediaForms";
import { MediaImport } from "./MediaImport";
import { MediaTable } from "./MediaTable";
import { MediaPagination } from "./MediaPagination";
import { mediaRequest } from "./client";

const sorts=[["name-asc","Name: A–Z"],["name-desc","Name: Z–A"],["contacts-desc","Most contacts"],["recent","Recently added"],["updated","Recently updated"],["country","Country / region"],["category","Original category"]];
const filterKeys=["location","category","rawCategory","topic","hasEmail","hasWebsite","hasContactPage","minContacts","maxContacts","updatedDays"];
export function MediaExplorer({result,options,query,abilities}:{result:MediaList;options:MediaOptions;query:MediaQuery;abilities:MediaAbilities}){
  const router=useRouter(),pathname=usePathname(),current=useSearchParams();
  const [search,setSearch]=useState(query.q??""),[filters,setFilters]=useState(false),[adding,setAdding]=useState(false),[importing,setImporting]=useState(false),[editing,setEditing]=useState<MediaDetail|null>(null),[deleting,setDeleting]=useState<MediaList["items"][number]|null>(null),[menu,setMenu]=useState<string|null>(null),[error,setError]=useState("");
  const [pending,startTransition]=useTransition();
  const selected=current.get("outlet"),tabValue=current.get("tab"),tab=mediaTabs.find(t=>t===tabValue)??"overview";
  function update(changes:Record<string,string|null>,reset=true){const params=new URLSearchParams(current.toString());for(const [key,value]of Object.entries(changes)){if(value)params.set(key,value);else params.delete(key);}if(reset)params.delete("page");startTransition(()=>router.replace(`${pathname}${params.size?`?${params}`:""}`,{scroll:false}));}
  const commitSearch=useEffectEvent(()=>{if(search!==(current.get("q")??""))update({q:search||null});});
  useEffect(()=>{const timer=setTimeout(()=>commitSearch(),350);return()=>clearTimeout(timer);},[search]);
  const active=filterKeys.filter(key=>current.has(key));
  function open(id:string,tab?:"contacts"){setMenu(null);const params=new URLSearchParams(current.toString());params.set("outlet",id);if(tab)params.set("tab",tab);else params.delete("tab");router.push(`${pathname}?${params}`,{scroll:false});}
  async function edit(id:string){setMenu(null);setError("");try{setEditing(await mediaRequest<MediaDetail>(`/api/media/${id}`));}catch(e){setError(e instanceof Error?e.message:"Unable to open publication.");}}
  function saved(id:string){setAdding(false);setEditing(null);open(id);router.refresh();}
  function filterLabel(key:string){return ({location:"Country / region",category:"Category",rawCategory:"Imported category",topic:"Topic",hasEmail:"Has email",hasWebsite:"Has website",hasContactPage:"Contact page / form",minContacts:"Minimum contacts",maxContacts:"Maximum contacts",updatedDays:"Updated within"} as Record<string,string>)[key]??key;}
  function filterValue(key:string){const value=current.get(key);return value==="true"?"Yes":value==="false"?"No":key==="category"?options.categories.find(v=>v.id===value)?.name??value:key==="topic"?options.topics.find(v=>v.id===value)?.name??value:key==="location"?options.locations.find(v=>v.value===value)?.label??value:key==="updatedDays"?`${value} days`:value;}
  return <>
    <section className="media-toolbar" aria-label="Media search and actions"><div className="database-search"><Search/><input aria-label="Search media" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search publication, domain, email, role, country…"/></div><button className="button outline" aria-expanded={filters} aria-controls="media-filters" onClick={()=>setFilters(!filters)}><SlidersHorizontal/>Filters {active.length>0&&<b>{active.length}</b>}</button><label className="media-sort">Sort by<select value={query.sort} onChange={e=>update({sort:e.target.value})}>{sorts.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><div className="media-primary-actions">{abilities.canImport&&<button className="button outline" onClick={()=>setImporting(true)}><FileSpreadsheet/>Import Excel</button>}{abilities.canCreate&&<button className="button primary" onClick={()=>setAdding(true)}><Plus/>Add Media</button>}</div></section>
    {filters&&<section id="media-filters" className="media-filter-panel" aria-label="Media filters">
      <Select label="Country / region" value={current.get("location")} options={options.locations} onChange={v=>update({location:v})}/>
      <Select label="Mapped category" value={current.get("category")} options={options.categories.map(v=>({value:v.id,label:v.name}))} onChange={v=>update({category:v})}/>
      <Select label="Original category" value={current.get("rawCategory")} options={options.rawCategories.map(v=>({value:v,label:v}))} onChange={v=>update({rawCategory:v})}/>
      <Select label="Topic" value={current.get("topic")} options={options.topics.map(v=>({value:v.id,label:v.name}))} onChange={v=>update({topic:v})}/>
      {[["hasEmail","Has email"],["hasWebsite","Has website"],["hasContactPage","Has contact page / web form"]].map(([key,label])=><Select key={key} label={label} value={current.get(key)} options={[{value:"true",label:"Yes"},{value:"false",label:"No"}]} onChange={v=>update({[key]:v})}/>)}
      <label>Minimum contacts<input key={`min-${current.get("minContacts")}`} type="number" min={0} max={10000} defaultValue={query.minContacts??""} onBlur={e=>update({minContacts:e.target.value||null})}/></label><label>Maximum contacts<input key={`max-${current.get("maxContacts")}`} type="number" min={0} max={10000} defaultValue={query.maxContacts??""} onBlur={e=>update({maxContacts:e.target.value||null})}/></label>
      <Select label="Updated within" value={current.get("updatedDays")} options={[7,30,90].map(v=>({value:String(v),label:`${v} days`}))} onChange={v=>update({updatedDays:v})}/><button className="button outline" onClick={()=>update(Object.fromEntries(filterKeys.map(k=>[k,null])))}>Clear filters</button>
    </section>}
    {active.length>0&&<div className="media-active-filters" aria-label="Applied filters">{active.map(key=><button key={key} onClick={()=>update({[key]:null})} aria-label={`Remove ${filterLabel(key)} filter`}><span>{filterLabel(key)}: <strong>{filterValue(key)}</strong></span><X/></button>)}<button className="media-clear-filters" onClick={()=>update(Object.fromEntries(filterKeys.map(key=>[key,null])))}>Clear all</button></div>}
    {error&&<p className="form-error" role="alert">{error}</p>}<div className="media-list-caption"><p role="status" aria-live="polite">{pending?"Updating publications…":<><strong>{result.total.toLocaleString()}</strong> publications</>}</p><span>Select a publication to view details and contacts</span></div>
    {result.items.length?<MediaTable result={result} selected={selected} searchParams={current.toString()} abilities={abilities} pending={pending} menu={menu} onMenu={setMenu} onOpen={open} onEdit={id=>void edit(id)} onDelete={item=>{setMenu(null);setDeleting(item);}}/>:<section className="media-list-empty"><Newspaper/><h2>{query.q||active.length?"No matching publications":"Your Media database is ready"}</h2><p>{query.q||active.length?"Try a different search or clear your filters.":"Import a workbook or add your first publication."}</p>{(query.q||active.length>0)&&<button className="button outline" onClick={()=>{setSearch("");update({...Object.fromEntries(filterKeys.map(key=>[key,null])),q:null});}}>Clear search & filters</button>}</section>}
    <MediaPagination result={result} pending={pending} onPage={page=>update({page:String(page)},false)} onSize={pageSize=>update({pageSize})}/>
    {selected&&<MediaDrawer key={selected} id={selected} tab={tab} onTab={v=>update({tab:v},false)} onClose={()=>update({outlet:null,tab:null},false)} onChanged={()=>router.refresh()} abilities={abilities}/>}
    {(adding||editing)&&<MediaForm initial={editing??undefined} onClose={()=>{setAdding(false);setEditing(null);}} onSaved={saved} canManageTaxonomy={abilities.canManageTaxonomy}/>}
    {importing&&<MediaImport onClose={()=>{setImporting(false);router.refresh();}} onImported={()=>router.refresh()}/>}
    {deleting&&<MediaConfirm title={`Delete ${deleting.name}?`} copy="This permanently deletes this media outlet and its contacts, internal notes and classification links. Shared categories, topics, companies and exhibitions are not deleted." onClose={()=>setDeleting(null)} onConfirm={async()=>{await mediaRequest(`/api/media/${deleting.id}`,"DELETE");if(selected===deleting.id)update({outlet:null,tab:null},false);setDeleting(null);router.refresh();}}/>}
  </>;
}
function Select({label,value,options,onChange}:{label:string;value:string|null;options:{value:string;label:string}[];onChange:(value:string|null)=>void}){return <label>{label}<select value={value??""} onChange={e=>onChange(e.target.value||null)}><option value="">Any</option>{Array.from(new Map(options.map(v=>[v.value,v])).values()).map(v=><option key={v.value} value={v.value}>{v.label}</option>)}</select></label>;}
