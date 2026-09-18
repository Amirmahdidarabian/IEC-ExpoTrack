import { NextResponse } from "next/server";
import { listExhibitions } from "@/lib/exhibitions/repository";

export async function GET() {
  const result = await listExhibitions({ pageSize: 50, sort: "recent" });
  return NextResponse.json(result.items.filter((item) => item.saved));
}
