import Link from "next/link";

export interface RaysPennantRun {
  year: string;
  headline: string;
  note: string;
  highlight?: boolean;
}

export function RaysPennantRunsChart({ data }: { data: RaysPennantRun[] }) {
  return (
    <div className="card px-4 py-3">
      <p className="text-xs font-semibold text-[var(--text)]">The Rays&rsquo; three trips to the ALCS</p>
      <p className="text-[11px] text-[var(--text-faint)]">Twenty-nine seasons, three pennant chances, and only one of them a sweep to get there.</p>
      <div className="mt-3 flex flex-col gap-2">
        {data.map((r) => (
          <div
            key={r.year}
            className={`rounded-lg p-3 ${r.highlight ? "bg-[var(--accent)]/10 border border-[var(--accent)]" : "bg-[var(--surface-muted)]"}`}
          >
            <div className="flex items-baseline gap-2">
              <span className="text-sm font-bold tabular-nums text-[var(--text)]">{r.year}</span>
              <span className="text-xs font-medium text-[var(--text)]">{r.headline}</span>
            </div>
            <p className="mt-1 text-[11px] text-[var(--text-faint)]">{r.note}</p>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-[var(--text-muted)]">
        MLB standings and results: <Link href="/mlb/standings" className="text-[var(--accent)] underline">/mlb/standings</Link>.
      </p>
    </div>
  );
}
