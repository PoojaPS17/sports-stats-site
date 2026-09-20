import { NextResponse } from "next/server";
import { isLeague } from "@/lib/leagues";
import { buildF1Feed, buildLeagueFeed, feedResponse, type Feed } from "@/lib/ics";

export const revalidate = 1800;

function respond(feed: Feed | null, download: boolean) {
  if (!feed) return new NextResponse("Not found", { status: 404 });
  return feedResponse(feed, download);
}

// GET /calendar/epl  → every Premier League fixture from the last two weeks on
// GET /calendar/f1   → the Formula 1 race calendar
export async function GET(request: Request, { params }: { params: Promise<{ league: string }> }) {
  const { league } = await params;
  const download = new URL(request.url).searchParams.get("download") === "1";
  const key = league.replace(/\.ics$/, "");
  if (key === "f1") return respond(await buildF1Feed(), download);
  if (!isLeague(key)) return new NextResponse("Not found", { status: 404 });
  return respond(await buildLeagueFeed(key), download);
}
