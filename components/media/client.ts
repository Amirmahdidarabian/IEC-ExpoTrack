import { boundedFetch } from "@/lib/client/request";
export async function mediaRequest<T>(url:string,method="GET",body?:unknown,signal?:AbortSignal):Promise<T>{
  const response=await boundedFetch(fetch,url,{method,headers:body===undefined?undefined:{"Content-Type":"application/json"},body:body===undefined?undefined:JSON.stringify(body),cache:"no-store",signal});
  const value=await response.json();if(!response.ok)throw new Error(typeof value.error==="string"?value.error:"Unable to complete this request.");return value as T;
}
export function downloadMediaReport(value:unknown,name:string){const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:"application/json"}));const a=document.createElement("a");a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
