import ExcelJS from "exceljs";
import JSZip from "jszip";
import { z } from "zod";
import { Readable } from "node:stream";
import { searchCountries } from "@/lib/locations";
import { normalizeNamespacedXlsx } from "@/lib/companies/xlsx-normalization";
import { cleanText, contactImportKey, mediaIdentity, normalizedMediaName, normalizeMediaUrl } from "./normalization";

export const MAX_MEDIA_IMPORT_BYTES=20*1024*1024;
export class MediaImportError extends Error {}
export const mappingSchema=z.object({publication:z.number().int().min(1).max(40),category:z.number().int().min(1).max(40),website:z.number().int().min(1).max(40),label:z.number().int().min(1).max(40),value:z.number().int().min(1).max(40),location:z.number().int().min(1).max(40)}).partial();
export type MediaMapping=Required<z.infer<typeof mappingSchema>>;
export type MediaIssue={row:number;field:string;message:string;severity:"warning"|"error"};
export type SourceRow={row:number;raw:Record<string,string>;warnings:string[]};
export type ParsedContact={roleLabel:string|null;email:string|null;contactPageUrl:string|null;contactMethod:"EMAIL"|"CONTACT_PAGE"|"WEBSITE_FORM"|"OTHER";sourceLabelRaw:string|null;sourceValueRaw:string|null;sourceSheet:string;sourceRow:number;importKey:string;position:number};
export type ParsedOutlet={row:number;name:string;normalizedName:string;identityKey:string;websiteUrl:string|null;domain:string|null;countryCode:string|null;countryName:string|null;publicationScopeRaw:string|null;sourceCategoryRaw:string|null;contacts:ParsedContact[];sources:SourceRow[]};
export const defaultMediaMapping:MediaMapping={publication:1,category:2,website:3,label:4,value:5,location:6};

/** Merged slave cells are not publication anchors. Formula results are never trusted. */
export function mediaCellText(cell:ExcelJS.Cell):{text:string;formula:boolean} {
  if(cell.isMerged&&cell.master.address!==cell.address)return {text:"",formula:false};
  function text(value:unknown,depth=0):string {
    if(value==null||depth>5)return "";
    if(typeof value==="string"||typeof value==="number"||typeof value==="boolean")return String(value);
    if(typeof value!=="object")return "";
    if("richText" in value&&Array.isArray(value.richText))return value.richText.map(v=>text(v,depth+1)).join("");
    if("text" in value)return text(value.text,depth+1);
    if("hyperlink" in value)return text(value.hyperlink,depth+1);
    return "";
  }
  const v=cell.value;
  if(v&&typeof v==="object"&&("formula" in v||"sharedFormula" in v))return {text:"",formula:true};
  return {text:text(v).trim(),formula:false};
}
async function readMediaWorkbook(buffer:Buffer) {
  if(!buffer.length||buffer.length>MAX_MEDIA_IMPORT_BYTES)throw new MediaImportError("Select an .xlsx workbook of at most 20 MB.");
  try {
    const zip=await JSZip.loadAsync(buffer); const entries=Object.values(zip.files);
    if(entries.length>2048)throw new Error("Too many archive entries");
    let expanded=0;
    for(const entry of entries){if(entry.dir)continue;const stream=new Readable().wrap(entry.nodeStream());for await(const chunk of stream){expanded+=Buffer.byteLength(chunk);if(expanded>64*1024*1024)throw new Error("Expanded workbook exceeds 64 MB");}}
    const load=async(data:Buffer)=>{const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength) as ArrayBuffer);return workbook;};
    try{return await load(buffer);}catch{const normalized=await normalizeNamespacedXlsx(buffer);if(!normalized)throw new Error("Invalid workbook");return await load(normalized);}
  } catch {throw new MediaImportError("The file is not a readable, bounded .xlsx workbook.");}
}
export function parseContactValue(raw:string) {
  const value=raw.trim();
  if(!value)return {emails:[] as string[],url:null as string|null,method:"OTHER" as const,ambiguous:false};
  if(/^call\s+in\s+site$/i.test(value)||/^contact\s+(via\s+)?website$/i.test(value))return {emails:[],url:null,method:"WEBSITE_FORM" as const,ambiguous:false};
  if(/^https?:\/\//i.test(value)||/^www\./i.test(value)){
    const url=normalizeMediaUrl(value);return {emails:[],url,method:url?"CONTACT_PAGE" as const:"OTHER" as const,ambiguous:!url};
  }
  const parts=value.replace(/^mailto:/i,"").split(/[;,\n|]+|\s+(?=[\w.+-]+@)/).map(v=>v.trim()).filter(Boolean);
  const emails=parts.map(v=>v.match(/<([^<>]+)>/)?.[1]??v).map(v=>v.trim().toLowerCase());
  if(emails.length&&emails.every(v=>z.string().email().safeParse(v).success))return {emails:[...new Set(emails)],url:null,method:"EMAIL" as const,ambiguous:false};
  return {emails:[],url:null,method:"OTHER" as const,ambiguous:true};
}
export async function mediaCountryLookup() {
  const countries=await searchCountries("",500);
  const map=new Map(countries.filter(c=>c.code.length===2).flatMap(c=>[[cleanText(c.name).toLowerCase(),c],[c.code.toLowerCase(),c],[c.iso3.toLowerCase(),c]] as const));
  for(const [alias,code] of Object.entries({usa:"US",uk:"GB",uae:"AE",turkey:"TR",turkiye:"TR","türki̇ye":"TR"})){const match=countries.find(c=>c.code===code);if(match)map.set(alias,match);}
  return (raw:string)=>{const found=map.get(cleanText(raw).toLowerCase());return found?{countryCode:found.code,countryName:found.name,publicationScopeRaw:null}:{countryCode:null,countryName:null,publicationScopeRaw:raw.trim()||null};};
}
export async function parseMediaWorkbook(buffer:Buffer,requested:Partial<MediaMapping>={}) {
  const workbook=await readMediaWorkbook(buffer);const sheet=workbook.getWorksheet("Sheet1");
  if(!sheet)throw new MediaImportError("Sheet1 was not found. Only Sheet1 may be imported; Sheet4 is never a media source.");
  if(sheet.rowCount>5000||sheet.columnCount>100)throw new MediaImportError("Workbook exceeds the 5,000 row / 100 column limit.");
  const headers=Array.from({length:Math.max(6,Math.min(sheet.columnCount,40))},(_,i)=>mediaCellText(sheet.getRow(1).getCell(i+1)).text);
  const detected={...defaultMediaMapping};const aliases:Record<keyof MediaMapping,string[]>={publication:["publication","publication name"],category:["category"],website:["website"],label:["contact label / role","contact label","role"],value:["email","contact method"],location:["country of publication","country / region"]};
  for(const key of Object.keys(aliases) as (keyof MediaMapping)[]){const index=headers.findIndex(v=>aliases[key].includes(v.toLowerCase()));if(index>=0)detected[key]=index+1;}
  const mapping={...detected,...mappingSchema.parse(requested)};
  if(new Set(Object.values(mapping)).size!==6)throw new MediaImportError("Map each field to a different column.");
  const location=await mediaCountryLookup();const outlets:ParsedOutlet[]=[],issues:MediaIssue[]=[];
  let current:ParsedOutlet|null=null,lastDataRow=1,continuationRows=0,contactRows=0,exactContactDuplicates=0;
  const names=new Map<string,ParsedOutlet[]>();
  for(let i=2;i<=sheet.rowCount;i++){
    const cells=Object.fromEntries((Object.keys(mapping) as (keyof MediaMapping)[]).map(k=>[k,mediaCellText(sheet.getRow(i).getCell(mapping[k]))])) as Record<keyof MediaMapping,{text:string;formula:boolean}>;
    if(!Object.values(cells).some(v=>v.text||v.formula))continue;
    lastDataRow=i;
    const warnings:string[]=[];const raw=Object.fromEntries(Object.entries(cells).map(([k,v])=>[k,v.formula?"[Formula rejected]":v.text]));
    const warn=(field:string,message:string,severity:MediaIssue["severity"]="warning")=>{issues.push({row:i,field,message,severity});warnings.push(message);};
    for(const [key,cell]of Object.entries(cells))if(cell.formula)warn(key,"Formula cell was rejected; cached results are not imported.","error");
    if(cells.publication.formula){current=null;continue;}
    const name=cleanText(cells.publication.text);
    if(name){
      if(name.length>300){warn("publication","Publication name is too long.","error");current=null;continue;}
      const websiteUrl=normalizeMediaUrl(cells.website.text);
      if(cells.website.text&&!websiteUrl)warn("website","Malformed website preserved in source diagnostics, not used as a link.");
      const country=location(cells.location.text);
      if(country.publicationScopeRaw)warn("location","Location retained as raw region/scope; no country flag assigned.");
      current={row:i,name,normalizedName:normalizedMediaName(name),identityKey:mediaIdentity(name,websiteUrl),websiteUrl,domain:websiteUrl?new URL(websiteUrl).hostname:null,...country,sourceCategoryRaw:cells.category.text||null,contacts:[],sources:[]};
      if(names.has(current.normalizedName))warn("publication","Repeated publication name; website identity must be reviewed before merging.");
      names.set(current.normalizedName,[...(names.get(current.normalizedName)??[]),current]);outlets.push(current);
    }else{
      if(cells.label.text||cells.value.text)continuationRows++;
      if(!current){warn("publication","Orphan continuation row has no preceding valid publication.","error");continue;}
      if(cells.category.text||cells.website.text||cells.location.text)warn("row","Publication-level continuation values preserved in provenance without overwriting the anchor.");
    }
    current.sources.push({row:i,raw,warnings});
    if(!cells.label.text&&!cells.value.text)continue;
    contactRows++;
    const parsed=parseContactValue(cells.value.text);
    if(parsed.ambiguous)warn("value","Unrecognized contact value preserved for review, not imported as email.");
    const values=parsed.emails.length?parsed.emails:[null];
    for(const email of values){
      const label=cleanText(cells.label.text)||null;
      const importKey=contactImportKey(label,parsed.method,email??parsed.url??cells.value.text);
      if(current.contacts.some(c=>c.importKey===importKey)){exactContactDuplicates++;warn("value","Exact contact label/method duplicate within publication ignored.");continue;}
      current.contacts.push({roleLabel:label,email,contactPageUrl:parsed.url,contactMethod:parsed.method,sourceLabelRaw:cells.label.text||null,sourceValueRaw:cells.value.text||null,sourceSheet:"Sheet1",sourceRow:i,importKey,position:current.contacts.length});
    }
  }
  if(!outlets.length)throw new MediaImportError("No valid publication anchors found in Sheet1. Check the column mapping.");
  const contacts=outlets.flatMap(v=>v.contacts);
  return {sheet:"Sheet1",ignoredSheets:workbook.worksheets.filter(s=>s.name!=="Sheet1").map(s=>s.name),headers,mapping,outlets,issues,counts:{
    scannedRows:lastDataRow-1,publicationAnchors:outlets.length,distinctNames:names.size,continuationRows,contactRows,contacts:contacts.length,
    validEmails:contacts.filter(c=>c.email).length,contactPages:contacts.filter(c=>c.contactMethod==="CONTACT_PAGE").length,
    websiteForms:contacts.filter(c=>c.contactMethod==="WEBSITE_FORM").length,nonEmailEntries:contacts.filter(c=>c.contactMethod!=="EMAIL").length,
    exactContactDuplicates,warnings:issues.filter(v=>v.severity==="warning").length,failedRows:new Set(issues.filter(v=>v.severity==="error").map(v=>v.row)).size,
    rawRegionScopes:outlets.filter(v=>v.publicationScopeRaw).length,ambiguousContactValues:issues.filter(v=>v.field==="value"&&v.message.startsWith("Unrecognized")).length,
  }};
}
