import { teamDisplayName } from "@/lib/teamName";
import { TeamLogo } from "./TeamLogo";
import { ExportShell, ExportTitle, ExportGroup, ExportTable, EXPORT_ROW_LIMIT, capRows, ExportMore, type ExportCell } from "./ExportShell";
import { formatSeasonLabel, type League } from "@/lib/queries";
import { isSoccer } from "@/lib/analytics";
import type { SeasonProjection } from "@/lib/simulator";
import { CARD } from "@/lib/exportTheme";
import { formatGameDate } from "@/lib/gameDay";

export function pct(p: number): string {
  if (p >= 0.995) return ">99%";
  if (p > 0 && p < 0.005) return "<1%";
  return `${Math.round(p * 100)}%`;
}

// Same tint as the live page's probability cells: blue for good outcomes, red for bad.
function prob(p: number, negative: boolean): ExportCell {
  if (p === 0) return "—";
  const a = 0.05 + Math.min(1, p) * 0.35;
  return { text: pct(p), bold: p >= 0.5, tone: "strong", background: negative ? `rgba(220, 38, 38, ${a})` : `rgba(29, 78, 216, ${a})` };
}

export function ProjectionTableExportCard({ league, proj, title, subtitle }: { league: League; proj: SeasonProjection; title: string; subtitle: string }) {
  const soccer = isSoccer(league);
  const grouped = league === "nfl" || league === "nba";
  const groups = grouped ? [...new Set(proj.teams.map((t) => t.conference ?? "League"))] : ["all"];
  const headers = ["Now", `Proj. ${soccer ? "Pts" : "W"}`, "Range", "Avg pos", ...proj.columns.map((c) => c.label)];
  const tables = groups.map((g) => {
    const teams = grouped ? proj.teams.filter((t) => (t.conference ?? "League") === g) : proj.teams;
    const table = (
      <ExportTable
        firstHeader="Team"
        headers={headers}
        limit={EXPORT_ROW_LIMIT}
        moreNoun="more teams"
        bare={grouped}
        rows={teams.map((t) => ({
          key: t.team.espn_id,
          lead: <TeamLogo name={teamDisplayName(t.team.name)} logoUrl={t.team.logo_url} color={t.team.color} size={22} />,
          name: teamDisplayName(t.team.name),
          cells: [
            soccer ? `${t.pointsNow} pts` : `${t.wins}-${t.losses}`,
            { text: t.expectedPoints.toFixed(1), tone: "strong", bold: true },
            `${t.pointsRange[0]}–${t.pointsRange[1]}`,
            t.expectedPosition.toFixed(1),
            ...proj.columns.map((c) => prob(t.outcomes[c.key], c.key === "relegation" || c.key === "out")),
          ],
        }))}
      />
    );
    return grouped ? <ExportGroup key={g} title={g}>{table}</ExportGroup> : <div key={g}>{table}</div>;
  });
  return (
    <ExportShell header={<ExportTitle league={league} title={title} subtitle={subtitle} />} context={title}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>{tables}</div>
    </ExportShell>
  );
}

export function UpcomingProbabilityExportCard({ league, proj, title }: { league: League; proj: SeasonProjection; title: string }) {
  const soccer = isSoccer(league);
  const { shown, hidden } = capRows(proj.upcoming);
  return (
    <ExportShell header={<ExportTitle league={league} title={title} subtitle={`Model win probability for the next seven days. ${formatSeasonLabel(league, proj.season)} season.`} />} context={title}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {shown.map(({ game, homeWin, draw, awayWin }) => (
          <div key={game.espn_id} style={{ background: CARD.bg, border: `1px solid ${CARD.border}`, borderRadius: 12, padding: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: CARD.textFaint }}>
              {formatGameDate(game.date, league, { weekday: "short", month: "short", day: "numeric" })}
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 6, fontSize: 14, fontWeight: 700, color: CARD.text }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <TeamLogo name={teamDisplayName(game.away_name)} logoUrl={game.away_logo} color={game.away_color} size={22} />
                {game.away_abbr ?? teamDisplayName(game.away_name)}
              </span>
              <span style={{ fontWeight: 500, color: CARD.textFaint }}>at</span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                {game.home_abbr ?? teamDisplayName(game.home_name)}
                <TeamLogo name={teamDisplayName(game.home_name)} logoUrl={game.home_logo} color={game.home_color} size={22} />
              </span>
            </div>
            <div style={{ display: "flex", height: 8, overflow: "hidden", borderRadius: 999, background: CARD.border, marginTop: 8 }}>
              <span style={{ width: `${awayWin * 100}%`, background: game.away_color ?? "#d97706" }} />
              {soccer && <span style={{ width: `${draw * 100}%`, background: CARD.textFaint }} />}
              <span style={{ flex: 1, background: game.home_color ?? CARD.accent }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: 12, color: CARD.textMuted, fontVariantNumeric: "tabular-nums" }}>
              <span style={{ fontWeight: awayWin > homeWin ? 800 : 500, color: awayWin > homeWin ? CARD.text : CARD.textMuted }}>{pct(awayWin)}</span>
              {soccer && <span>draw {pct(draw)}</span>}
              <span style={{ fontWeight: homeWin > awayWin ? 800 : 500, color: homeWin > awayWin ? CARD.text : CARD.textMuted }}>{pct(homeWin)}</span>
            </div>
          </div>
        ))}
      </div>
      <ExportMore boxed count={hidden} noun={hidden === 1 ? "more game" : "more games"} />
    </ExportShell>
  );
}
