export interface StrikeoutRecordRow {
  game: string;
  strikeouts: number;
  note: string;
  highlight?: boolean;
}

export function GuardiansStrikeoutRecordsChart({ data }: { data: StrikeoutRecordRow[] }) {
  const max = Math.max(1, ...data.map((r) => r.strikeouts));
  return (
    <div className="card px-4 py-3">
      <p className="text-xs font-semibold text-[var(--text)]">Most strikeouts by one team, nine-inning game</p>
      <p className="text-[11px] text-[var(--text-faint)]">Regular season or postseason, before and after Game 5.</p>
      <div className="mt-3 flex flex-col gap-2">
        {data.map((r) => (
          <div key={r.game} className="flex items-center gap-2" title={`${r.game}: ${r.note}`}>
            <span className="w-36 shrink-0 text-xs font-medium text-[var(--text-muted)]">{r.game}</span>
            <div className="h-4 flex-1 rounded bg-[var(--surface-muted)]">
              <div
                className={`h-4 rounded ${r.highlight ? "bg-[var(--accent)]" : "bg-[var(--text-faint)]"}`}
                style={{ width: `${Math.max(4, (r.strikeouts / max) * 100)}%` }}
              />
            </div>
            <span className="w-8 shrink-0 text-right text-xs font-bold tabular-nums text-[var(--text)]">{r.strikeouts}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
