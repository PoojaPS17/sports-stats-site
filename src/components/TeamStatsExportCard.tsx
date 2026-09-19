import type { TeamStatGroup } from "@/lib/matchDetail";
import { formatStat } from "@/lib/statGlossary";
import { teamDisplayName } from "@/lib/teamName";
import { ExportShell, ExportLabel } from "./ExportShell";
import { MatchScoreHeader } from "./MatchScoreHeader";
import type { GameRow, League } from "@/lib/queries";
import { CARD } from "@/lib/exportTheme";

const AWAY_COLOR = "#d97706";

// The downloadable version of TeamStatsComparison: the same stat-by-stat split bars,
// under the scoreline, on the fixed light card so it reads the same shared into a
// group chat as it does live.
export function TeamStatsExportCard({ league, game, away, home, title }: { league: League; game: GameRow; away: TeamStatGroup; home: TeamStatGroup; title: string }) {
  const rows = away.stats.map((stat, i) => ({
    label: stat.label,
    awayValue: formatStat(stat.label, stat.value),
    homeValue: formatStat(stat.label, home.stats[i]?.value ?? "-"),
  }));

  return (
    <ExportShell header={<MatchScoreHeader league={league} game={game} />} context={`${teamDisplayName(away.teamName)} vs ${teamDisplayName(home.teamName)}`}>
      <div style={{ paddingTop: 16, borderTop: `1px solid ${CARD.border}` }}>
        <ExportLabel>{title}</ExportLabel>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 6, fontSize: 14, fontWeight: 800, color: CARD.text }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 10, height: 10, borderRadius: 999, background: AWAY_COLOR }} />
          {teamDisplayName(away.teamName)}
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          {teamDisplayName(home.teamName)}
          <span style={{ width: 10, height: 10, borderRadius: 999, background: CARD.accent }} />
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 14 }}>
        {rows.map((row, i) => {
          const a = Number(String(row.awayValue).replace(/[^0-9.-]/g, ""));
          const h = Number(String(row.homeValue).replace(/[^0-9.-]/g, ""));
          const total = Math.abs(a) + Math.abs(h);
          const awayPct = total > 0 ? (Math.abs(a) / total) * 100 : 50;
          return (
            <div key={`${row.label}-${i}`} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, fontSize: 14 }}>
                <span style={{ fontWeight: 700, color: CARD.text }}>{row.awayValue}</span>
                <span style={{ fontSize: 12, color: CARD.textMuted, textAlign: "center" }}>{row.label}</span>
                <span style={{ fontWeight: 700, color: CARD.text }}>{row.homeValue}</span>
              </div>
              <div style={{ display: "flex", height: 6, overflow: "hidden", borderRadius: 999, background: CARD.bg }}>
                <span style={{ display: "block", height: "100%", width: `${awayPct}%`, background: AWAY_COLOR }} />
                <span style={{ display: "block", height: "100%", flex: 1, background: CARD.accent }} />
              </div>
            </div>
          );
        })}
      </div>
    </ExportShell>
  );
}
