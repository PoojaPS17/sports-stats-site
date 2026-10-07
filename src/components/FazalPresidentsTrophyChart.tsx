export interface FazalStatTile {
  value: string;
  label: string;
  note: string;
}

export function FazalPresidentsTrophyChart({ data }: { data: FazalStatTile[] }) {
  return (
    <div className="card px-4 py-3">
      <p className="text-xs font-semibold text-[var(--text)]">Fazal&rsquo;s comeback innings, by the numbers</p>
      <p className="text-[11px] text-[var(--text-faint)]">A maiden triple century built State Bank of Pakistan&rsquo;s innings win over Ghani.</p>
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
