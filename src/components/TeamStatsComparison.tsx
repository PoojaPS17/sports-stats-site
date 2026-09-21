import type { TeamStatGroup } from "@/lib/matchDetail";
import { formatStat } from "@/lib/statGlossary";

// Renders each stat as a mini horizontal bar split between the two teams — makes the
// side with the bigger number immediately visible instead of just two raw numbers.
// `homeFirst` (football) puts the home side on the left, as the match header and timeline do; the NBA and NFL
// keep the visitors on the left. Each team keeps its own bar colour whichever side it is on.
export function TeamStatsComparison({ away, home, homeFirst = false }: { away: TeamStatGroup; home: TeamStatGroup; homeFirst?: boolean }) {
  const rows = away.stats.map((stat, i) => ({
    label: stat.label,
    awayValue: formatStat(stat.label, stat.value),
    homeValue: formatStat(stat.label, home.stats[i]?.value ?? "-"),
  }));
  if (rows.length === 0) return null;
  const awayColor = "bg-[var(--accent-2)]";
  const homeColor = "bg-[var(--accent)]";

  return (
    <div className="card flex flex-col gap-3 px-4 py-4">
      <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">
        <span>{homeFirst ? home.teamName : away.teamName}</span>
        <span>{homeFirst ? away.teamName : home.teamName}</span>
      </div>
      {rows.map((row, i) => {
        const a = Number(String(row.awayValue).replace(/[^0-9.-]/g, ""));
        const h = Number(String(row.homeValue).replace(/[^0-9.-]/g, ""));
        const total = Math.abs(a) + Math.abs(h);
        const awayPct = total > 0 ? (Math.abs(a) / total) * 100 : 50;
        const leftValue = homeFirst ? row.homeValue : row.awayValue;
        const rightValue = homeFirst ? row.awayValue : row.homeValue;
        const leftPct = homeFirst ? 100 - awayPct : awayPct;
        return (
          <div key={`${row.label}-${i}`} className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-sm">
              <span className="tabular-nums font-semibold">{leftValue}</span>
              <span className="text-xs text-[var(--text-muted)]">{row.label}</span>
              <span className="tabular-nums font-semibold">{rightValue}</span>
            </div>
            <div className="flex h-1.5 overflow-hidden rounded-full bg-[var(--surface-muted)]">
              <span className={`h-full ${homeFirst ? homeColor : awayColor}`} style={{ width: `${leftPct}%` }} />
              <span className={`h-full flex-1 ${homeFirst ? awayColor : homeColor}`} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
