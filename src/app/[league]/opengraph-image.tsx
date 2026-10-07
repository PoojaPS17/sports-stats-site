import { ImageResponse } from "next/og";
import { isLeague, LEAGUE_LABEL } from "@/lib/queries";
import { isCricketLeague } from "@/lib/leagues";
import { OG_SIZE, ogCard, ogFallback } from "@/lib/ogCard";

export const alt = "League scores and stats";
export const size = OG_SIZE;
export const contentType = "image/png";
// The league's name and what the site holds for it: nothing that moves.
export const revalidate = 86400;

// An empty list, so nothing is built up front: each card is drawn on the first request and then served from
// the cache above (see static-params.test.ts).
export function generateStaticParams() {
  return [];
}

// Share image for a league hub: the competition named large over what the page offers.
export default async function Image({ params }: { params: Promise<{ league: string }> }) {
  const { league } = await params;
  if (!isLeague(league)) return new ImageResponse(ogFallback(), size);
  const detail = isCricketLeague(league) ? "Scores · Scorecards · Series · Players" : "Scores · Standings · Teams · Leaders";
  return new ImageResponse(ogCard({ kicker: "Live scores and stats", title: LEAGUE_LABEL[league], detail }), size);
}
