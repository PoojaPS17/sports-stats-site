export interface ShootingMedalsByEdition {
  edition: string;
  hostCity: string;
  total: number;
  /** True while the Games this edition belongs to are still open — the bar is styled and labeled as partial. */
  partial: boolean;
}

export function ShootingMedalsByEditionChart({ data }: { data: ShootingMedalsByEdition[] }) {
  const max = Math.max(1, ...data.map((d) => d.total));
  const hasPartial = data.some((d) => d.partial);
  return (
    <div className="card px-4 py-3">
      <div className="flex items-end gap-4" style={{ height: 120 }}>
        {data.map((d) => (
          <div
            key={d.edition}
            className="flex flex-1 flex-col items-center justify-end gap-1"
            title={`${d.total} shooting medal${d.total === 1 ? "" : "s"} at the ${d.edition} Asian Games${d.partial ? " (competition still ongoing)" : ""}`}
          >
            <span className="text-xs font-semibold tabular-nums">
              {d.total}
              {d.partial ? "*" : ""}
            </span>
            <div
              className={`w-full rounded-t ${d.partial ? "bg-[var(--accent-2)]" : "bg-[var(--accent)]"}`}
              style={{ height: `${Math.max(4, (d.total / max) * 80)}px`, opacity: d.partial ? 0.85 : 0.9 }}
            />
            <span className="text-[10px] font-medium text-[var(--text-muted)]">{d.edition}</span>
            <span className="text-[10px] text-[var(--text-faint)]">{d.hostCity}</span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-[var(--text-muted)]">
        India&rsquo;s shooting medal count by Asian Games edition.{hasPartial ? " *Partial total: competition still ongoing." : ""}
      </p>
    </div>
  );
}
