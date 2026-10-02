export interface ChinaSwimmingGoldsByEdition {
  edition: string;
  hostCity: string;
  gold: number;
}

export function ChinaSwimmingGoldsByEditionChart({ data }: { data: ChinaSwimmingGoldsByEdition[] }) {
  const max = Math.max(1, ...data.map((d) => d.gold));
  return (
    <div className="card px-4 py-3">
      <div className="flex items-end gap-4" style={{ height: 120 }}>
        {data.map((d) => (
          <div
            key={d.edition}
            className="flex flex-1 flex-col items-center justify-end gap-1"
            title={`China won ${d.gold} swimming golds at the ${d.edition} Asian Games`}
          >
            <span className="text-xs font-semibold tabular-nums">{d.gold}</span>
            <div
              className="w-full rounded-t bg-[var(--accent)]"
              style={{ height: `${Math.max(4, (d.gold / max) * 80)}px`, opacity: 0.9 }}
            />
            <span className="text-[10px] font-medium text-[var(--text-muted)]">{d.edition}</span>
            <span className="text-[10px] text-[var(--text-faint)]">{d.hostCity}</span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-[var(--text-muted)]">China&rsquo;s swimming gold medal count by Asian Games edition.</p>
    </div>
  );
}
