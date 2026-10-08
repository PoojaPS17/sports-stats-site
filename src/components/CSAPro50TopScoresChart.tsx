import Link from "next/link";

export interface CSAPro50ScoreRow {
  player: string;
  team: string;
  runs: number;
  note: string;
  highlight?: boolean;
}

export function CSAPro50TopScoresChart({ data }: { data: CSAPro50ScoreRow[] }) {
  const max = Math.max(1, ...data.map((r) => r.runs));
  return (
    <div className="card px-4 py-3">
      <p className="text-xs font-semibold text-[var(--text)]">Highest innings scores, CSA Women&rsquo;s Pro50 2026/27</p>
      <p className="text-[11px] text-[var(--text-faint)]">Through the opening round of the league stage.</p>
      <div className="mt-3 flex flex-col gap-2">
        {data.map((r) => (
          <div key={r.player} className="flex items-center gap-2" title={`${r.player} (${r.team}): ${r.note}`}>
            <span className="w-32 shrink-0 text-xs font-medium text-[var(--text-muted)]">{r.player}</span>
            <div className="h-4 flex-1 rounded bg-[var(--surface-muted)]">
              <div
                className={`h-4 rounded ${r.highlight ? "bg-[var(--accent)]" : "bg-[var(--text-faint)]"}`}
                style={{ width: `${Math.max(4, (r.runs / max) * 100)}%` }}
              />
            </div>
            <span className="w-14 shrink-0 text-right text-xs font-bold tabular-nums text-[var(--text)]">{r.runs}</span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-[var(--text-muted)]">
        Full points table and stats: <Link href="/cricket/series/1554058" className="text-[var(--accent)] underline">CSA Women&rsquo;s Pro50 2026/27</Link>.
      </p>
    </div>
  );
}
