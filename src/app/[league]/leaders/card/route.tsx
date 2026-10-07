import { ImageResponse } from "next/og";
import { isLeague } from "@/lib/queries";
import { CARD_FONTS } from "@/lib/cardFont";
import { CHART_CARD_SIZES, type ChartCardFormat } from "@/lib/chartCard";
import { leadersCardElement } from "@/lib/leadersCard";
import { loadLeaders } from "@/lib/leadersView";

export const revalidate = 300;

// The leaders page's own boards as a picture with an address of its own, so it can be pasted into a chat or a post as a
// link: /nba/leaders/card?format=portrait. The boards move with every game, so a copy lives five minutes (the site-wide cap).
export async function GET(request: Request, { params }: { params: Promise<{ league: string }> }) {
  const { league } = await params;
  const format = new URL(request.url).searchParams.get("format") ?? "portrait";
  if (!(format in CHART_CARD_SIZES)) return new Response("Bad format", { status: 400 });
  if (!isLeague(league)) return new Response("Not found", { status: 404 });

  const { boards, season } = await loadLeaders(league);
  if (boards.every((b) => b.rows.length === 0)) return new Response("Not found", { status: 404 });

  const element = leadersCardElement({ league, season, boards, format: format as ChartCardFormat });
  const png = new ImageResponse(element, { ...CHART_CARD_SIZES[format as ChartCardFormat], fonts: CARD_FONTS });
  const headers = new Headers(png.headers);
  headers.set("cache-control", "public, s-maxage=300, stale-while-revalidate=3600");
  return new Response(png.body, { status: png.status, headers });
}
