import Link from "next/link";

export interface SeasonRecordRow {
  season: string;
  wins: number;
  losses: number;
  highlight?: boolean;
}

export function WhiteSoxTurnaroundChart({ data }: { data: SeasonRecordRow[] }) {
  const max = Math.max(1, ...data.map((r) => r.wins));
  return (
    <div className="card px-4 py-3">
      <p className="text-xs font-semibold text-[var(--text)]">White Sox record by season</p>
      <p className="text-[11px] text-[var(--text-faint)]">From a modern-era loss record to an AL Wild Card Series sweep in two years.</p>
      <div className="mt-3 flex flex-col gap-2">
        {data.map((r) => (
          <div key={r.season} className="flex items-center gap-2" title={`${r.season}: ${r.wins}-${r.losses}`}>
            <span className="w-14 shrink-0 text-xs font-medium text-[var(--text-muted)]">{r.season}</span>
            <div className="h-4 flex-1 rounded bg-[var(--surface-muted)]">
              <div
                className={`h-4 rounded ${r.highlight ? "bg-[var(--accent)]" : "bg-[var(--text-faint)]"}`}
                style={{ width: `${Math.max(4, (r.wins / max) * 100)}%` }}
              />
            </div>
            <span className="w-16 shrink-0 text-right text-xs font-bold tabular-nums text-[var(--text)]">
              {r.wins}-{r.losses}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-[var(--text-muted)]">
        Full standings: <Link href="/mlb/standings" className="text-[var(--accent)] underline">/mlb/standings</Link>.
      </p>
    </div>
  );
}
