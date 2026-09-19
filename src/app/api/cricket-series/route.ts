import { NextResponse } from "next/server";
import { searchCricketSeries } from "@/lib/cricketSeries";

// Typeahead behind the cricket series picker (nav Cricket menu, /cricket/series):
// every series and tournament in the database, the ones the live and upcoming lists
// leave out included.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ results: [] });
  const results = await searchCricketSeries(q, 8);
  return NextResponse.json({ results }, { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } });
}
