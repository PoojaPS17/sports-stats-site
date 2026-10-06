import Link from "next/link";

export interface NFCWestStandingsRow {
  team: string;
  wins: number;
  losses: number;
  highlight?: boolean;
}

export function NFCWestStandingsChart({ data, asOf }: { data: NFCWestStandingsRow[]; asOf: string }) {
  const max = Math.max(1, ...data.map((r) => r.wins));
  return (
    <div className="card px-4 py-3">
      <p className="text-xs font-semibold text-[var(--text)]">NFC West, four weeks in</p>
      <p className="text-[11px] text-[var(--text-faint)]">Records as of {asOf}.</p>
      <div className="mt-3 flex flex-col gap-2">
        {data.map((r) => (
          <div key={r.team} className="flex items-center gap-2" title={`${r.team}: ${r.wins}-${r.losses}`}>
            <span className="w-36 shrink-0 text-xs font-medium text-[var(--text-muted)]">{r.team}</span>
            <div className="h-4 flex-1 rounded bg-[var(--surface-muted)]">
              <div
                className={`h-4 rounded ${r.highlight ? "bg-[var(--accent)]" : "bg-[var(--text-faint)]"}`}
                style={{ width: `${Math.max(4, (r.wins / max) * 100)}%` }}
              />
            </div>
            <span className="w-10 shrink-0 text-right text-xs font-bold tabular-nums text-[var(--text)]">
              {r.wins}-{r.losses}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-[var(--text-muted)]">
        Full table: <Link href="/nfl/standings" className="text-[var(--accent)] underline">/nfl/standings</Link>.
      </p>
    </div>
  );
}
