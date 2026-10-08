import { ImageResponse } from "next/og";
import { isLeague, hasStandings, formatSeasonLabel } from "@/lib/queries";
import { CARD_FONTS } from "@/lib/cardFont";
import { STANDINGS_CARD_SIZES, standingsCardElement, type StandingsCardFormat } from "@/lib/standingsCard";
import { currentStandingsView } from "@/lib/standingsView";

export const revalidate = 300;

// The standings page's own table as a picture with an address of its own, so it can be pasted into a chat or a post as
// a link: /nba/standings/card?format=portrait. The table moves with every result, so a copy lives five minutes (the site-wide cap).
export async function GET(request: Request, { params }: { params: Promise<{ league: string }> }) {
  const { league } = await params;
  const format = new URL(request.url).searchParams.get("format") ?? "portrait";
  if (!(format in STANDINGS_CARD_SIZES)) return new Response("Bad format", { status: 400 });
  if (!isLeague(league) || !hasStandings(league)) return new Response("Not found", { status: 404 });

  const { standings, activeSeason, fallbackSeason, preseason } = await currentStandingsView(league);
  if (standings.length === 0) return new Response("Not found", { status: 404 });

  const subtitle = activeSeason ? `${formatSeasonLabel(league, activeSeason)} ${preseason ? "preseason" : "season"}${fallbackSeason ? " (final)" : ""}` : null;
  const element = standingsCardElement({ league, standings, subtitle, format: format as StandingsCardFormat });
  const png = new ImageResponse(element, { ...STANDINGS_CARD_SIZES[format as StandingsCardFormat], fonts: CARD_FONTS });
  const headers = new Headers(png.headers);
  headers.set("cache-control", "public, s-maxage=300, stale-while-revalidate=3600");
  return new Response(png.body, { status: png.status, headers });
}
