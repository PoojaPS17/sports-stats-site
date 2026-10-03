import Link from "next/link";

export interface WildCardGameRow {
  game: string;
  whiteSoxRuns: number;
  astrosRuns: number;
}

export function WhiteSoxAstrosWildCardChart({ data }: { data: WildCardGameRow[] }) {
  const max = Math.max(1, ...data.map((g) => Math.max(g.whiteSoxRuns, g.astrosRuns)));
  return (
    <div className="card px-4 py-3">
      <p className="text-xs font-semibold text-[var(--text)]">AL Wild Card Series, at Houston</p>
      <p className="text-[11px] text-[var(--text-faint)]">Chicago won both games at Daikin Park to sweep the best-of-three.</p>
      <div className="mt-3 flex flex-col gap-2">
        {data.map((g) => (
          <div
            key={g.game}
            className="flex items-center gap-2"
            title={`${g.game}: White Sox ${g.whiteSoxRuns}, Astros ${g.astrosRuns}`}
          >
            <span className="w-16 shrink-0 text-xs font-medium text-[var(--text-muted)]">{g.game}</span>
            <div className="h-4 flex-1 rounded bg-[var(--surface-muted)]">
              <div className="h-4 rounded bg-[var(--accent)]" style={{ width: `${Math.max(4, (g.whiteSoxRuns / max) * 100)}%` }} />
            </div>
            <span className="w-14 shrink-0 text-right text-xs font-bold tabular-nums text-[var(--text)]">
              {g.whiteSoxRuns}-{g.astrosRuns}
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
