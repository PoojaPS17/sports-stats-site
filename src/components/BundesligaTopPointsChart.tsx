import Link from "next/link";

export interface BundesligaPointsRow {
  team: string;
  points: number;
  played: number;
  highlight?: boolean;
}

export function BundesligaTopPointsChart({ data, asOf }: { data: BundesligaPointsRow[]; asOf: string }) {
  const max = Math.max(1, ...data.map((r) => r.points));
  return (
    <div className="card px-4 py-3">
      <p className="text-xs font-semibold text-[var(--text)]">Bundesliga table, top of the pile</p>
      <p className="text-[11px] text-[var(--text-faint)]">Points after matchday 4, as of {asOf}.</p>
      <div className="mt-3 flex flex-col gap-2">
        {data.map((r) => (
          <div key={r.team} className="flex items-center gap-2" title={`${r.team}: ${r.points} points from ${r.played} played`}>
            <span className="w-32 shrink-0 text-xs font-medium text-[var(--text-muted)]">{r.team}</span>
            <div className="h-4 flex-1 rounded bg-[var(--surface-muted)]">
              <div
                className={`h-4 rounded ${r.highlight ? "bg-[var(--accent)]" : "bg-[var(--text-faint)]"}`}
                style={{ width: `${Math.max(4, (r.points / max) * 100)}%` }}
              />
            </div>
            <span className="w-8 shrink-0 text-right text-xs font-bold tabular-nums text-[var(--text)]">{r.points}</span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-[var(--text-muted)]">
        Full table: <Link href="/bundesliga/standings" className="text-[var(--accent)] underline">/bundesliga/standings</Link>.
      </p>
    </div>
  );
}
