export interface SwimmingGoldsRecordRow {
  athlete: string;
  country: string;
  gold: number;
  edition: string;
  highlight?: boolean;
}

export function AsianGamesSwimmingGoldsChart({ data }: { data: SwimmingGoldsRecordRow[] }) {
  const max = Math.max(1, ...data.map((r) => r.gold));
  return (
    <div className="card px-4 py-3">
      <p className="text-xs font-semibold text-[var(--text)]">Most swimming golds at one Asian Games</p>
      <p className="text-[11px] text-[var(--text-faint)]">Gold medals won by a single swimmer at one edition of the Games.</p>
      <div className="mt-3 flex flex-col gap-2">
        {data.map((r) => (
          <div key={r.athlete} className="flex items-center gap-2" title={`${r.athlete} (${r.country}): ${r.gold} golds, ${r.edition}`}>
            <span className="w-32 shrink-0 text-xs font-medium text-[var(--text-muted)]">{r.athlete}</span>
            <div className="h-4 flex-1 rounded bg-[var(--surface-muted)]">
              <div
                className={`h-4 rounded ${r.highlight ? "bg-[var(--accent)]" : "bg-[var(--text-faint)]"}`}
                style={{ width: `${Math.max(4, (r.gold / max) * 100)}%` }}
              />
            </div>
            <span className="w-6 shrink-0 text-right text-xs font-bold tabular-nums text-[var(--text)]">{r.gold}</span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-[var(--text-muted)]">{data.map((r) => r.edition).join(" vs. ")}, both swum by China.</p>
    </div>
  );
}
