import { ImageResponse } from "next/og";
import { isLeague, LEAGUE_LABEL, getPlayerBySlug } from "@/lib/queries";
import { OG_SIZE, ogCard, ogFallback, ogPosition } from "@/lib/ogCard";

export const alt = "Player page";
export const size = OG_SIZE;
export const contentType = "image/png";
// Name, team and competition only: a day behind a transfer is close enough for a picture beside a link.
export const revalidate = 86400;

// An empty list, so nothing is built up front: each card is drawn on the first request and then served from
// the cache above (see static-params.test.ts).
export function generateStaticParams() {
  return [];
}

// Share image for a player page: the name large under the competition, then position and team.
export default async function Image({ params }: { params: Promise<{ league: string; slug: string }> }) {
  const { league, slug } = await params;
  const player = isLeague(league) ? await getPlayerBySlug(league, slug) : null;
  if (!player || !isLeague(league)) return new ImageResponse(ogFallback(), size);
  const color = player.team_color ? `#${player.team_color.replace(/^#/, "")}` : undefined;
  const detail = [ogPosition(player.position), player.team_name].filter(Boolean).join(" · ");
  return new ImageResponse(ogCard({ kicker: `${LEAGUE_LABEL[league]} player`, title: player.name, detail: detail || "Season stats · Game log", color }), size);
}
