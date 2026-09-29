export interface FastestTo100Row {
  player: string;
  team: string;
  games: number;
  highlight?: boolean;
}

/** Games needed to reach 100 Bundesliga goals. Lower is faster, so the shortest bar wins. */
export function BundesligaFastestTo100Chart({ data }: { data: FastestTo100Row[] }) {
  const max = Math.max(1, ...data.map((r) => r.games));
  return (
    <div className="card px-4 py-3">
      <p className="text-xs font-semibold text-[var(--text)]">Fewest games to 100 Bundesliga goals</p>
      <p className="text-[11px] text-[var(--text-faint)]">Fewer games is faster.</p>
      <div className="mt-3 flex flex-col gap-2">
        {data.map((r) => (
          <div key={r.player} className="flex items-center gap-2" title={`${r.player} (${r.team}): ${r.games} games to 100 goals`}>
            <span className="w-28 shrink-0 text-xs font-medium text-[var(--text-muted)]">{r.player}</span>
            <div className="h-4 flex-1 rounded bg-[var(--surface-muted)]">
              <div
                className={`h-4 rounded ${r.highlight ? "bg-[var(--accent)]" : "bg-[var(--text-faint)]"}`}
                style={{ width: `${Math.max(4, (r.games / max) * 100)}%` }}
              />
            </div>
            <span className="w-10 shrink-0 text-right text-xs font-bold tabular-nums text-[var(--text)]">{r.games}</span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-[var(--text-muted)]">Games played to reach a Bundesliga century, all-time.</p>
    </div>
  );
}
