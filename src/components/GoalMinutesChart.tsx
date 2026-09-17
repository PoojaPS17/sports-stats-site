import type { GoalBand } from "@/lib/playerProfile";

// When in the match the goals came, from the stored match reports. Reports exist for
// completed games the backfill has reached, so the caption says how many of the
// player's games the chart covers.
export function GoalMinutesChart({ bands, reports, games }: { bands: GoalBand[]; reports: number; games: number }) {
  const shown = bands.filter((b, i) => b.goals > 0 || i < 6);
  const total = shown.reduce((a, b) => a + b.goals, 0);
  const max = Math.max(1, ...shown.map((b) => b.goals));
  return (
    <div className="card px-4 py-3">
      <div className="flex items-end gap-2" style={{ height: 120 }}>
        {shown.map((b) => (
          <div key={b.label} className="flex flex-1 flex-col items-center justify-end gap-1" title={`${b.goals} goal${b.goals === 1 ? "" : "s"}, minutes ${b.label}`}>
            <span className="text-xs font-semibold tabular-nums">{b.goals}</span>
            <div className="w-full rounded-t bg-[var(--accent)]" style={{ height: `${Math.max(2, (b.goals / max) * 80)}px`, opacity: b.goals === 0 ? 0.25 : 0.9 }} />
            <span className="text-[10px] text-[var(--text-muted)]">{b.label}</span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-[var(--text-muted)]">
        {total} goal{total === 1 ? "" : "s"} by minute, from the {reports} of {games} games with a stored match report.
      </p>
    </div>
  );
}
