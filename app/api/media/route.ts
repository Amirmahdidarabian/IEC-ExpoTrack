import { NextRequest } from "next/server";
import { z } from "zod";
import { createMedia, listMedia, mediaOptions } from "@/lib/media/repository";
import { mediaJson, mediaRoute } from "@/lib/media/http";
import { parseMediaQuery } from "@/lib/media/query";
export async function GET(request:NextRequest){return mediaRoute(request,"VIEW_MEDIA",async()=>({...await listMedia(parseMediaQuery(Object.fromEntries(request.nextUrl.searchParams))),options:await mediaOptions()}));}
export async function POST(request:NextRequest){return mediaRoute(request,"CREATE_MEDIA",async actor=>{
  const body=z.object({outlet:z.unknown(),allowSimilar:z.boolean().optional()}).parse(await mediaJson(request));return createMedia(body.outlet,actor.id,body.allowSimilar);
},201);}
