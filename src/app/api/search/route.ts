import { NextResponse } from "next/server";
import { search } from "@/lib/queries";

// Lightweight JSON search used by the comparison pickers (typeahead). Same query as
// the /search page, optionally narrowed to one league and one entity type.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim();
  const league = searchParams.get("league");
  const type = searchParams.get("type");
  if (q.length < 2) return NextResponse.json({ results: [] });

  const results = (await search(q, 40)).filter((r) => (!league || r.league === league) && (!type || r.type === type)).slice(0, 8);
  return NextResponse.json({ results }, { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } });
}
