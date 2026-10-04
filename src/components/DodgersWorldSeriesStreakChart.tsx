import Link from "next/link";

export interface WorldSeriesStreakTile {
  value: string;
  label: string;
  note: string;
}

export function DodgersWorldSeriesStreakChart({ data }: { data: WorldSeriesStreakTile[] }) {
  return (
    <div className="card px-4 py-3">
      <p className="text-xs font-semibold text-[var(--text)]">The Dodgers&rsquo; three-peat bid</p>
      <p className="text-[11px] text-[var(--text-faint)]">No team has won three straight titles since the Yankees, 1998-2000.</p>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {data.map((s) => (
          <div key={s.value} className="rounded-lg bg-[var(--surface-muted)] p-3">
            <p className="text-2xl font-bold tabular-nums text-[var(--accent)]">{s.value}</p>
            <p className="text-xs font-medium text-[var(--text)]">{s.label}</p>
            <p className="mt-1 text-[11px] text-[var(--text-faint)]">{s.note}</p>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-[var(--text-muted)]">
        MLB standings and results: <Link href="/mlb/standings" className="text-[var(--accent)] underline">/mlb/standings</Link>.
      </p>
    </div>
  );
}
