import type { TeamStatGroup } from "@/lib/matchDetail";
import { formatStat } from "@/lib/statGlossary";
import { teamDisplayName } from "@/lib/teamName";
import { ExportShell, ExportLabel } from "./ExportShell";
import { MatchScoreHeader } from "./MatchScoreHeader";
import type { GameRow, League } from "@/lib/queries";
import { CARD } from "@/lib/exportTheme";
import { scoreLineHomeFirst } from "@/lib/gamePage";

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

  // Football puts the home side on the left, as the scoreline above does; the NBA and NFL the visitors.
  const homeFirst = scoreLineHomeFirst(league);
  const left = homeFirst ? { name: home.teamName, color: CARD.accent, value: (r: (typeof rows)[number]) => r.homeValue } : { name: away.teamName, color: AWAY_COLOR, value: (r: (typeof rows)[number]) => r.awayValue };
  const right = homeFirst ? { name: away.teamName, color: AWAY_COLOR, value: (r: (typeof rows)[number]) => r.awayValue } : { name: home.teamName, color: CARD.accent, value: (r: (typeof rows)[number]) => r.homeValue };

  return (
    <ExportShell header={<MatchScoreHeader league={league} game={game} />} context={`${teamDisplayName(left.name)} vs ${teamDisplayName(right.name)}`}>
      <div style={{ paddingTop: 16, borderTop: `1px solid ${CARD.border}` }}>
        <ExportLabel>{title}</ExportLabel>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 6, fontSize: 14, fontWeight: 800, color: CARD.text }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 10, height: 10, borderRadius: 999, background: left.color }} />
          {teamDisplayName(left.name)}
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          {teamDisplayName(right.name)}
          <span style={{ width: 10, height: 10, borderRadius: 999, background: right.color }} />
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 14 }}>
        {rows.map((row, i) => {
          const a = Number(String(row.awayValue).replace(/[^0-9.-]/g, ""));
          const h = Number(String(row.homeValue).replace(/[^0-9.-]/g, ""));
          const total = Math.abs(a) + Math.abs(h);
          const awayPct = total > 0 ? (Math.abs(a) / total) * 100 : 50;
          const leftPct = homeFirst ? 100 - awayPct : awayPct;
          return (
            <div key={`${row.label}-${i}`} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, fontSize: 14 }}>
                <span style={{ fontWeight: 700, color: CARD.text }}>{left.value(row)}</span>
                <span style={{ fontSize: 12, color: CARD.textMuted, textAlign: "center" }}>{row.label}</span>
                <span style={{ fontWeight: 700, color: CARD.text }}>{right.value(row)}</span>
              </div>
              <div style={{ display: "flex", height: 6, overflow: "hidden", borderRadius: 999, background: CARD.bg }}>
                <span style={{ display: "block", height: "100%", width: `${leftPct}%`, background: left.color }} />
                <span style={{ display: "block", height: "100%", flex: 1, background: right.color }} />
              </div>
            </div>
          );
        })}
      </div>
    </ExportShell>
  );
}
