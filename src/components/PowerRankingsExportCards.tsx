import { teamDisplayName } from "@/lib/teamName";
import { TeamLogo } from "./TeamLogo";
import { ExportShell, ExportTitle, ExportTable, ExportList, EXPORT_ROW_LIMIT } from "./ExportShell";
import { formatSeasonLabel, type League } from "@/lib/queries";
import type { EloRow, FixtureDifficultyRow } from "@/lib/analytics";
import { CARD } from "@/lib/exportTheme";

export function PowerRankingsExportCard({ league, season, rows, title }: { league: League; season: number | null; rows: EloRow[]; title: string }) {
  return (
    <ExportShell header={<ExportTitle league={league} title={title} subtitle={season ? `${formatSeasonLabel(league, season)} season. Elo ratings from every result on record.` : null} />} context={title}>
      <ExportTable
        firstHeader="Team"
        headers={["Rating", "Last 5", "Peak"]}
        limit={EXPORT_ROW_LIMIT}
        moreNoun="more teams"
        rows={rows.map((r, i) => ({
          key: r.team.espn_id,
          rank: i + 1,
          lead: <TeamLogo name={teamDisplayName(r.team.name)} logoUrl={r.team.logo_url} color={r.team.color} size={22} />,
          name: teamDisplayName(r.team.name),
          cells: [
            { text: String(Math.round(r.rating)), tone: "strong", bold: true },
            { text: `${r.trend > 0 ? "▲ " : r.trend < 0 ? "▼ " : ""}${Math.abs(Math.round(r.trend))}`, tone: r.trend > 0 ? "win" : r.trend < 0 ? "loss" : "muted" },
            String(Math.round(r.peak)),
          ],
        }))}
      />
    </ExportShell>
  );
}

export function FixtureRunsExportCard({ league, title, subtitle, runs, tone }: { league: League; title: string; subtitle: string; runs: FixtureDifficultyRow[]; tone: "hard" | "easy" }) {
  return (
    <ExportShell header={<ExportTitle league={league} title={title} subtitle={subtitle} />} context={title}>
      <div style={{ border: `1px solid ${CARD.border}`, borderRadius: 12, overflow: "hidden" }}>
        <ExportList
          limit={EXPORT_ROW_LIMIT}
          rows={runs.map((r) => ({
            key: r.team.espn_id,
            lead: <TeamLogo name={teamDisplayName(r.team.name)} logoUrl={r.team.logo_url} color={r.team.color} size={24} />,
            title: teamDisplayName(r.team.name),
            sub: r.opponents.map((o) => `${o.home ? "vs" : "at"} ${o.team.abbreviation ?? teamDisplayName(o.team.name)}`).join("  ·  "),
            value: <span style={{ color: tone === "hard" ? CARD.loss : CARD.win }}>{Math.round(r.averageOpponentRating)}</span>,
          }))}
        />
      </div>
    </ExportShell>
  );
}
