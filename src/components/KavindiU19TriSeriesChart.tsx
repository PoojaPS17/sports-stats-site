export interface KavindiStatTile {
  value: string;
  label: string;
  note: string;
}

export function KavindiU19TriSeriesChart({ data }: { data: KavindiStatTile[] }) {
  return (
    <div className="card px-4 py-3">
      <p className="text-xs font-semibold text-[var(--text)]">Kavindi&rsquo;s tri-series, by the numbers</p>
      <p className="text-[11px] text-[var(--text-faint)]">Two unbeaten knocks have carried Sri Lanka through the group stage so far.</p>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {data.map((s) => (
          <div key={s.label} className="rounded-lg bg-[var(--surface-muted)] p-3">
            <p className="text-2xl font-bold tabular-nums text-[var(--accent)]">{s.value}</p>
            <p className="text-xs font-medium text-[var(--text)]">{s.label}</p>
            <p className="mt-1 text-[11px] text-[var(--text-faint)]">{s.note}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
