import type { TeamStatGroup } from "@/lib/matchDetail";
import { formatStat } from "@/lib/statGlossary";
import { ExportFooter } from "./ExportFooter";
import { LEAGUE_LABEL, type League } from "@/lib/queries";
import { CARD } from "@/lib/exportTheme";

// The downloadable version of TeamStatsComparison: same stat-by-stat split bars, on
// the fixed light card so it reads the same shared into a group chat as it does live.
export function TeamStatsExportCard({ league, away, home }: { league: League; away: TeamStatGroup; home: TeamStatGroup }) {
  const rows = away.stats.map((stat, i) => ({
    label: stat.label,
    awayValue: formatStat(stat.label, stat.value),
    homeValue: formatStat(stat.label, home.stats[i]?.value ?? "-"),
  }));

  return (
    <div style={{ background: CARD.surface, border: `1px solid ${CARD.border}`, borderRadius: 16, padding: 24 }}>
      <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: CARD.textMuted }}>{LEAGUE_LABEL[league]} · Team Stats</div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 4, fontSize: 15, fontWeight: 800, color: CARD.text }}>
        <span>{away.teamName}</span>
        <span>{home.teamName}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 16 }}>
        {rows.map((row, i) => {
          const a = Number(String(row.awayValue).replace(/[^0-9.-]/g, ""));
          const h = Number(String(row.homeValue).replace(/[^0-9.-]/g, ""));
          const total = Math.abs(a) + Math.abs(h);
          const awayPct = total > 0 ? (Math.abs(a) / total) * 100 : 50;
          return (
            <div key={`${row.label}-${i}`} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 14 }}>
                <span style={{ fontWeight: 700, color: CARD.text }}>{row.awayValue}</span>
                <span style={{ fontSize: 12, color: CARD.textMuted }}>{row.label}</span>
                <span style={{ fontWeight: 700, color: CARD.text }}>{row.homeValue}</span>
              </div>
              <div style={{ display: "flex", height: 6, overflow: "hidden", borderRadius: 999, background: CARD.bg }}>
                <span style={{ display: "block", height: "100%", width: `${awayPct}%`, background: "#d97706" }} />
                <span style={{ display: "block", height: "100%", flex: 1, background: CARD.accent }} />
              </div>
            </div>
          );
        })}
      </div>
      <ExportFooter context={`${away.teamName} vs ${home.teamName}`} />
    </div>
  );
}
