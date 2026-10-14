import Link from "next/link";

export interface NlcsGameRow {
  game: string;
  brewersRuns: number;
  dodgersRuns: number;
}

export function BrewersDodgersNlcsChart({ data }: { data: NlcsGameRow[] }) {
  const max = Math.max(1, ...data.map((g) => Math.max(g.brewersRuns, g.dodgersRuns)));
  return (
    <div className="card px-4 py-3">
      <p className="text-xs font-semibold text-[var(--text)]">NLCS, at American Family Field</p>
      <p className="text-[11px] text-[var(--text-faint)]">Milwaukee has led the series from the first pitch, both games decided after a Dodgers lineup stocked with stars went quiet late.</p>
      <div className="mt-3 flex flex-col gap-2">
        {data.map((g) => (
          <div key={g.game} className="flex items-center gap-2" title={`${g.game}: Brewers ${g.brewersRuns}, Dodgers ${g.dodgersRuns}`}>
            <span className="w-16 shrink-0 text-xs font-medium text-[var(--text-muted)]">{g.game}</span>
            <div className="h-4 flex-1 rounded bg-[var(--surface-muted)]">
              <div className="h-4 rounded bg-[var(--accent)]" style={{ width: `${Math.max(4, (g.brewersRuns / max) * 100)}%` }} />
            </div>
            <span className="w-14 shrink-0 text-right text-xs font-bold tabular-nums text-[var(--text)]">
              {g.brewersRuns}-{g.dodgersRuns}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-[var(--text-muted)]">
        MLB standings and results: <Link href="/mlb/standings" className="text-[var(--accent)] underline">/mlb/standings</Link>.
      </p>
    </div>
  );
}
