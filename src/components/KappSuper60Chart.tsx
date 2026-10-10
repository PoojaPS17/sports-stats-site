export interface KappStatTile {
  value: string;
  label: string;
  note: string;
}

export function KappSuper60Chart({ data }: { data: KappStatTile[] }) {
  return (
    <div className="card px-4 py-3">
      <p className="text-xs font-semibold text-[var(--text)]">Kapp&rsquo;s Super60 Women, by the numbers</p>
      <p className="text-[11px] text-[var(--text-faint)]">Vancouver Warriors&rsquo; three innings in the Canada Super60 Women 2026-27.</p>
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
