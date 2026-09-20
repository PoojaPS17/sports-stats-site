import { NextResponse } from "next/server";
import { isLeague } from "@/lib/leagues";
import { buildTeamFeed, feedResponse } from "@/lib/ics";

export const revalidate = 1800;

// GET /calendar/epl/arsenal → Arsenal's full current-season schedule with results
export async function GET(request: Request, { params }: { params: Promise<{ league: string; slug: string }> }) {
  const { league, slug } = await params;
  if (!isLeague(league)) return new NextResponse("Not found", { status: 404 });
  const download = new URL(request.url).searchParams.get("download") === "1";
  const feed = await buildTeamFeed(league, slug.replace(/\.ics$/, ""));
  if (!feed) return new NextResponse("Not found", { status: 404 });
  return feedResponse(feed, download);
}
