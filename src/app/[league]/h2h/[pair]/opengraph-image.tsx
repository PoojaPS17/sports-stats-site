import { ImageResponse } from "next/og";
import { isLeague, LEAGUE_LABEL } from "@/lib/queries";
import { getHeadToHead } from "@/lib/analytics";
import { OG_SIZE, ogCard, ogFallback } from "@/lib/ogCard";

export const alt = "Head-to-head record";
export const size = OG_SIZE;
export const contentType = "image/png";
// A record moves with each new meeting, which is rare: an hour behind is close enough for a picture beside a link.
export const revalidate = 3600;

// An empty list, so nothing is built up front: each card is drawn on the first request and then served from
// the cache above (see static-params.test.ts).
export function generateStaticParams() {
  return [];
}

// Share image for a head-to-head page: the two sides, then the all-time record between them.
export default async function Image({ params }: { params: Promise<{ league: string; pair: string }> }) {
  const { league, pair } = await params;
  const idx = pair.indexOf("-vs-");
  if (!isLeague(league) || idx <= 0) return new ImageResponse(ogFallback(), size);
  const h2h = await getHeadToHead(league, pair.slice(0, idx), pair.slice(idx + 4));
  if (!h2h) return new ImageResponse(ogFallback(), size);
  const record = `${h2h.winsA}-${h2h.draws}-${h2h.winsB}`;
  const detail = `${h2h.meetings} meetings in ${LEAGUE_LABEL[league]} · ${h2h.teamA.name} ${h2h.winsA} wins, ${h2h.teamB.name} ${h2h.winsB}`;
  return new ImageResponse(
    ogCard({
      kicker: "Head to head",
      title: `${h2h.teamA.name} vs ${h2h.teamB.name}`,
      detail,
      children: <div style={{ fontSize: 96, fontWeight: 800, color: "#c6f135", letterSpacing: -2 }}>{record}</div>,
    }),
    size
  );
}
