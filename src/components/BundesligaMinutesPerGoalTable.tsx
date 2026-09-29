export interface MinutesPerGoalRow {
  player: string;
  team: string;
  minutesPerGoal: number;
  highlight?: boolean;
}

/** Bundesliga minutes per goal for a set of players, lowest (best strike rate) first. */
export function BundesligaMinutesPerGoalTable({ data, asOf }: { data: MinutesPerGoalRow[]; asOf: string }) {
  return (
    <div className="card px-4 py-3">
      <p className="text-xs font-semibold text-[var(--text)]">Bundesliga minutes per goal</p>
      <p className="text-[11px] text-[var(--text-faint)]">Among the league&rsquo;s current top scorers, as of {asOf}.</p>
      <table className="mt-3 w-full border-collapse text-xs">
        <thead>
          <tr className="border-b border-[var(--border)] text-left text-[var(--text-faint)]">
            <th className="py-1.5 font-medium">Player</th>
            <th className="py-1.5 font-medium">Team</th>
            <th className="py-1.5 text-right font-medium">Min/goal</th>
          </tr>
        </thead>
        <tbody>
          {data.map((r) => (
            <tr key={r.player} className="border-b border-[var(--border)] last:border-0">
              <td className={`py-1.5 ${r.highlight ? "font-bold text-[var(--text)]" : "text-[var(--text-muted)]"}`}>{r.player}</td>
              <td className="py-1.5 text-[var(--text-muted)]">{r.team}</td>
              <td className={`py-1.5 text-right tabular-nums ${r.highlight ? "font-bold text-[var(--text)]" : "text-[var(--text-muted)]"}`}>
                {r.minutesPerGoal.toFixed(1)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
