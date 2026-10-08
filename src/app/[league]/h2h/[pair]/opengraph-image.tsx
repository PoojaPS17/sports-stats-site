import { ImageResponse } from "next/og";
import { isLeague, LEAGUE_LABEL } from "@/lib/queries";
import { getHeadToHead } from "@/lib/analytics";
import { OG_SIZE, ogCard, ogFallback, ogRivalry } from "@/lib/ogCard";
import { rivalryMeter } from "@/lib/rivalry";
import { h2hOtherResults, h2hRecord } from "@/lib/h2h";
import { isCricketLeague } from "@/lib/leagues";
import { teamDisplayName } from "@/lib/teamName";

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

// Share image for a head-to-head page: the two sides, then the record between them.
export default async function Image({ params }: { params: Promise<{ league: string; pair: string }> }) {
  const { league, pair } = await params;
  const idx = pair.indexOf("-vs-");
  if (!isLeague(league) || idx <= 0) return new ImageResponse(ogFallback(), size);
  const h2h = await getHeadToHead(league, pair.slice(0, idx), pair.slice(idx + 4));
  if (!h2h) return new ImageResponse(ogFallback(), size);
  const record = h2hRecord(h2h);
  const other = h2hOtherResults(h2h);
  // Cricket: "29 meetings in Test Cricket · England 10 wins, India 16, 3 drawn", and when some result is missing, how many are recorded.
  const recordedMeetings = h2h.meetings - h2h.unknown;
  const count = h2h.unknown > 0 ? `${recordedMeetings} of ${h2h.meetings} meetings with a result` : `${h2h.meetings} meetings`;
  const detail = `${count} in ${LEAGUE_LABEL[league]} · ${h2h.teamA.name} ${h2h.winsA} wins, ${h2h.teamB.name} ${h2h.winsB}${isCricketLeague(league) && other ? `, ${other}` : ""}`;
  const meter = rivalryMeter(h2h, (t) => teamDisplayName(t.name));
  const colorA = h2h.teamA.color ? `#${h2h.teamA.color.replace(/^#/, "")}` : "#38b6e8";
  const colorB = h2h.teamB.color ? `#${h2h.teamB.color.replace(/^#/, "")}` : "#f59e0b";
  const short = (t: typeof h2h.teamA) => t.abbreviation ?? teamDisplayName(t.name).slice(0, 3).toUpperCase();
  const pill = (r: "A" | "B" | "D" | "T" | "N") => ({ text: r === "A" ? short(h2h.teamA) : r === "B" ? short(h2h.teamB) : r === "T" ? "TIE" : r === "N" ? "NR" : "D", border: r === "A" ? colorA : r === "B" ? colorB : "#6b7690" });
  return new ImageResponse(
    ogCard({
      kicker: "Head to head",
      title: `${h2h.teamA.name} vs ${h2h.teamB.name}`,
      detail,
      children: ogRivalry({ record, label: meter.label, pills: meter.last5.map(pill) }),
    }),
    size
  );
}
