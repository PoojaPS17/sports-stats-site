export interface SkubalStatTile {
  value: string;
  label: string;
  note: string;
}

export function SkubalByTheNumbersChart({ data }: { data: SkubalStatTile[] }) {
  return (
    <div className="card px-4 py-3">
      <p className="text-xs font-semibold text-[var(--text)]">Skubal, before and after the trade</p>
      <p className="text-[11px] text-[var(--text-faint)]">From a Tigers rotation out of contention to a Dodgers playoff debut.</p>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
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
