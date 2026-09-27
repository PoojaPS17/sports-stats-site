import Link from "next/link";

export interface F1StandingsEntry {
  driver: string;
  points: number;
  wins: number;
}

export function F1DriversStandingsChart({ data, round, totalRounds }: { data: F1StandingsEntry[]; round: number; totalRounds: number }) {
  const max = Math.max(1, ...data.map((d) => d.points));
  return (
    <div className="card px-4 py-3">
      <p className="text-xs font-semibold text-[var(--text)]">F1 drivers&rsquo; championship, top six</p>
      <p className="text-[11px] text-[var(--text-faint)]">
        Round {round} of {totalRounds}
      </p>
      <div className="mt-3 flex flex-col gap-2">
        {data.map((d, i) => (
          <div key={d.driver} className="flex items-center gap-2" title={`${d.driver}: ${d.points} points, ${d.wins} win${d.wins === 1 ? "" : "s"}`}>
            <span className="w-20 shrink-0 text-xs font-medium text-[var(--text-muted)]">{d.driver}</span>
            <div className="h-4 flex-1 rounded bg-[var(--surface-muted)]">
              <div
                className={`h-4 rounded ${i < 2 ? "bg-[var(--accent)]" : "bg-[var(--text-faint)]"}`}
                style={{ width: `${Math.max(4, (d.points / max) * 100)}%`, opacity: i < 2 ? 1 : 0.7 }}
              />
            </div>
            <span className="w-9 shrink-0 text-right text-xs font-bold tabular-nums text-[var(--text)]">{d.points}</span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-[var(--text-muted)]">
        Points as of the most recent round. Live table: <Link href="/f1/standings" className="text-[var(--accent)] underline">/f1/standings</Link>.
      </p>
    </div>
  );
}
