export interface DaviesStatTile {
  value: string;
  label: string;
  note: string;
}

export function DaviesSheffieldShieldChart({ data }: { data: DaviesStatTile[] }) {
  return (
    <div className="card px-4 py-3">
      <p className="text-xs font-semibold text-[var(--text)]">Davies&rsquo; double century, by the numbers</p>
      <p className="text-[11px] text-[var(--text-faint)]">
        The fastest double hundred in Sheffield Shield history, in the competition&rsquo;s season opener.
      </p>
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
