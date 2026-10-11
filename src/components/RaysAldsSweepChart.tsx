export interface RaysAldsStatTile {
  value: string;
  label: string;
  note: string;
}

export function RaysAldsSweepChart({ data }: { data: RaysAldsStatTile[] }) {
  return (
    <div className="card px-4 py-3">
      <p className="text-xs font-semibold text-[var(--text)]">Rays 3, Yankees 0: the ALDS sweep by the numbers</p>
      <p className="text-[11px] text-[var(--text-faint)]">Three games, one bullpen-and-rotation performance that barely let New York breathe.</p>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-4">
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
