export interface LuusTitansStatTile {
  value: string;
  label: string;
  note: string;
}

export function LuusTitansPro50Chart({ data }: { data: LuusTitansStatTile[] }) {
  return (
    <div className="card px-4 py-3">
      <p className="text-xs font-semibold text-[var(--text)]">Luus&rsquo;s 167*, by the numbers</p>
      <p className="text-[11px] text-[var(--text-faint)]">Titans Women vs Lions Women, 4th Match, CSA Women&rsquo;s Pro50, at SuperSport Park.</p>
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
