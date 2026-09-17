import { NextResponse } from "next/server";
import { isLeague } from "@/lib/leagues";
import { buildTeamFeed } from "@/lib/ics";

export const revalidate = 1800;

// GET /calendar/epl/arsenal → Arsenal's full current-season schedule with results
export async function GET(request: Request, { params }: { params: Promise<{ league: string; slug: string }> }) {
  const { league, slug } = await params;
  if (!isLeague(league)) return new NextResponse("Not found", { status: 404 });
  const download = new URL(request.url).searchParams.get("download") === "1";
  const feed = await buildTeamFeed(league, slug.replace(/\.ics$/, ""));
  if (!feed) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(feed.ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${feed.filename}"`,
      "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=3600",
    },
  });
}
