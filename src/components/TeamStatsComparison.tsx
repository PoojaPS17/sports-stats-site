import type { TeamStatGroup } from "@/lib/matchDetail";
import { formatStat } from "@/lib/statGlossary";

// Renders each stat as a mini horizontal bar split between the two teams — makes the
// side with the bigger number immediately visible instead of just two raw numbers.
export function TeamStatsComparison({ away, home }: { away: TeamStatGroup; home: TeamStatGroup }) {
  const rows = away.stats.map((stat, i) => ({
    label: stat.label,
    awayValue: formatStat(stat.label, stat.value),
    homeValue: formatStat(stat.label, home.stats[i]?.value ?? "-"),
  }));
  if (rows.length === 0) return null;

  return (
    <div className="card flex flex-col gap-3 px-4 py-4">
      <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">
        <span>{away.teamName}</span>
        <span>{home.teamName}</span>
      </div>
      {rows.map((row, i) => {
        const a = Number(String(row.awayValue).replace(/[^0-9.-]/g, ""));
        const h = Number(String(row.homeValue).replace(/[^0-9.-]/g, ""));
        const total = Math.abs(a) + Math.abs(h);
        const awayPct = total > 0 ? (Math.abs(a) / total) * 100 : 50;
        return (
          <div key={`${row.label}-${i}`} className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-sm">
              <span className="tabular-nums font-semibold">{row.awayValue}</span>
              <span className="text-xs text-[var(--text-muted)]">{row.label}</span>
              <span className="tabular-nums font-semibold">{row.homeValue}</span>
            </div>
            <div className="flex h-1.5 overflow-hidden rounded-full bg-[var(--surface-muted)]">
              <span className="h-full bg-[var(--accent-2)]" style={{ width: `${awayPct}%` }} />
              <span className="h-full flex-1 bg-[var(--accent)]" />
            </div>
          </div>
        );
      })}
    </div>
  );
}
