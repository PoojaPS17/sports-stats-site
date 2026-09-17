import { NextResponse } from "next/server";
import { isLeague } from "@/lib/leagues";
import { buildF1Feed, buildLeagueFeed } from "@/lib/ics";

export const revalidate = 1800;

function respond(feed: { filename: string; ics: string } | null, download: boolean) {
  if (!feed) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(feed.ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${feed.filename}"`,
      "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=3600",
    },
  });
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
