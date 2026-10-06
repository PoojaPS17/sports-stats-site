import { ImageResponse } from "next/og";
import { PixelBall } from "@/components/Logo";
import { getCricketSeries, getCricketSeriesBySeason, getCricketSeriesSeasons } from "@/lib/cricketSeries";
import { getCricketSeriesStats } from "@/lib/cricketSeriesStatsData";
import { fetchCricketSeriesStandings, pointsTableShown } from "@/lib/cricketSeriesStandings";
import { teamDisplayName } from "@/lib/teamName";
import { cricketSeasonCardModel, cricketSeriesCardModel, type SeriesCardModel } from "@/lib/cricketShareCards";

export const alt = "Cricket series";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
// The leaders move with each stored scorecard and the table with each result: an hour behind is
// close enough for a picture beside a link, and the page itself carries the live figures.
export const revalidate = 3600;

// An empty list, so nothing is built up front: each card is drawn on the first request and then
// served from the cache above until it goes stale (see static-params.test.ts).
export function generateStaticParams() {
  return [];
}

// A season archive is a calendar year; the page beside this one reads the same ids the same way.
const SEASON_RE = /^(19|20)\d{2}$/;

const BG = "linear-gradient(135deg, #0b1324 0%, #121c33 100%)";

/** The card as the page's data says it should read, or null for an id that is no series or season. */
async function model(id: string): Promise<SeriesCardModel | null> {
  if (id === "archive" || SEASON_RE.test(id)) {
    const seasons = await getCricketSeriesSeasons();
    const season = SEASON_RE.test(id) ? Number(id) : seasons[0];
    if (!season || !seasons.includes(season)) return null;
    return cricketSeasonCardModel(season, (await getCricketSeriesBySeason(season)).length);
  }
  const s = await getCricketSeries(id);
  if (!s) return null;
  // A competition with a hub (the IPL, the World Cups) keeps its leaders and table there, as the page does.
  const [stats, table] = s.league ? [null, null] : await Promise.all([getCricketSeriesStats(s.espn_id), fetchCricketSeriesStandings(s.espn_id)]);
  const top = table && pointsTableShown(table, s) && table.groups.length === 1 ? (table.groups[0].rows[0] ?? null) : null;
  return cricketSeriesCardModel(s, stats, top ? { team: teamDisplayName(top.team), points: top.points, played: top.played } : null);
}

/** A long series name steps down so it stays on two lines at most. */
function titleSize(title: string): number {
  return title.length > 48 ? 52 : title.length > 32 ? 62 : 72;
}

/**
 * Share card of a cricket series page: the series named large under its kind and formats, its dates, then
 * the table leader and the leaders, or how far along it is. Series pages earn most of the site's search
 * clicks and shared the generic card until now, so a series link looked like the homepage.
 */
export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const card = await model(id);
  if (!card) {
    return new ImageResponse(<div style={{ width: "100%", height: "100%", background: "#0b1324", color: "#eef1f7", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 64 }}>SportsDB</div>, size);
  }

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 56, background: BG, color: "#eef1f7", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 26, textTransform: "uppercase", letterSpacing: 3 }}>
          <span style={{ color: "#c6f135", fontWeight: 700 }}>{card.eyebrow}</span>
          {card.dates && <span style={{ color: "#9aa5bd" }}>{card.dates}</span>}
        </div>

        <div style={{ display: "flex", fontSize: titleSize(card.title), fontWeight: 800, lineHeight: 1.08, letterSpacing: -1.5 }}>{card.title}</div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {card.facts.map((f) => (
            <div key={f.label} style={{ display: "flex", alignItems: "baseline", gap: 24 }}>
              <div style={{ display: "flex", width: 250, fontSize: 24, color: "#9aa5bd", textTransform: "uppercase", letterSpacing: 2 }}>{f.label}</div>
              <div style={{ display: "flex", fontSize: 34, fontWeight: 700 }}>{f.value}</div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 26, color: "#c6f135", fontWeight: 700 }}>
          <PixelBall size={28} fill="#ffffff" live="#c6f135" />
          SportsDB
        </div>
      </div>
    ),
    size
  );
}
