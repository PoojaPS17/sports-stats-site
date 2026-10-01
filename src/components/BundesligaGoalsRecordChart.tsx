import Link from "next/link";

export interface GoalsToHundredRow {
  player: string;
  club: string;
  games: number;
  season: string;
  highlight?: boolean;
}

export function BundesligaGoalsRecordChart({ data }: { data: GoalsToHundredRow[] }) {
  const max = Math.max(1, ...data.map((r) => r.games));
  return (
    <div className="card px-4 py-3">
      <p className="text-xs font-semibold text-[var(--text)]">Fastest to 100 Bundesliga goals</p>
      <p className="text-[11px] text-[var(--text-faint)]">Appearances needed to reach a century of league goals for one club.</p>
      <div className="mt-3 flex flex-col gap-2">
        {data.map((r) => (
          <div key={r.player} className="flex items-center gap-2" title={`${r.player} (${r.club}): 100 goals in ${r.games} appearances, ${r.season}`}>
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
      <p className="mt-2 text-xs text-[var(--text-muted)]">
        Fewer games is faster. Bundesliga scorers: <Link href="/bundesliga/leaders" className="text-[var(--accent)] underline">/bundesliga/leaders</Link>.
      </p>
    </div>
  );
}
