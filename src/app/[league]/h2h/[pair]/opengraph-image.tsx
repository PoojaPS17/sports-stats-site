import { ImageResponse } from "next/og";
import { isLeague, LEAGUE_LABEL } from "@/lib/queries";
import { getHeadToHead } from "@/lib/analytics";
import { OG_SIZE, ogCard, ogFallback } from "@/lib/ogCard";
import { rivalryMeter } from "@/lib/rivalry";
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

// Share image for a head-to-head page: the two sides, then the all-time record between them.
export default async function Image({ params }: { params: Promise<{ league: string; pair: string }> }) {
  const { league, pair } = await params;
  const idx = pair.indexOf("-vs-");
  if (!isLeague(league) || idx <= 0) return new ImageResponse(ogFallback(), size);
  const h2h = await getHeadToHead(league, pair.slice(0, idx), pair.slice(idx + 4));
  if (!h2h) return new ImageResponse(ogFallback(), size);
  const record = `${h2h.winsA}-${h2h.draws}-${h2h.winsB}`;
  const detail = `${h2h.meetings} meetings in ${LEAGUE_LABEL[league]} · ${h2h.teamA.name} ${h2h.winsA} wins, ${h2h.teamB.name} ${h2h.winsB}`;
  const meter = rivalryMeter(h2h, (t) => teamDisplayName(t.name));
  const colorA = h2h.teamA.color ? `#${h2h.teamA.color.replace(/^#/, "")}` : "#c6f135";
  const colorB = h2h.teamB.color ? `#${h2h.teamB.color.replace(/^#/, "")}` : "#f59e0b";
  const short = (t: typeof h2h.teamA) => t.abbreviation ?? teamDisplayName(t.name).slice(0, 3).toUpperCase();
  const pill = (r: "A" | "B" | "D") => ({ text: r === "A" ? short(h2h.teamA) : r === "B" ? short(h2h.teamB) : "D", border: r === "A" ? colorA : r === "B" ? colorB : "#6b7690" });
  return new ImageResponse(
    ogCard({
      kicker: "Head to head",
      title: `${h2h.teamA.name} vs ${h2h.teamB.name}`,
      detail,
      children: (
        <div style={{ display: "flex", alignItems: "center", gap: 36 }}>
          <div style={{ fontSize: 96, fontWeight: 800, color: "#c6f135", letterSpacing: -2 }}>{record}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {meter.label && <div style={{ fontSize: 34, fontWeight: 700 }}>{meter.label}</div>}
            {meter.last5.length > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ fontSize: 22, color: "#9aa5bd" }}>Last {meter.last5.length}</div>
                {meter.last5.map((r, i) => (
                  <div key={i} style={{ display: "flex", padding: "2px 10px", borderRadius: 999, border: `3px solid ${pill(r).border}`, background: "#1b2742", fontSize: 20, fontWeight: 700 }}>
                    {pill(r).text}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ),
    }),
    size
  );
}
