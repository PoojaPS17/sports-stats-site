import Link from "next/link";

export interface BarcelonaStreakGame {
  opponent: string;
  competition: "La Liga" | "Champions League";
  goalsFor: number;
  goalsAgainst: number;
}

export function BarcelonaOpeningStreakChart({ data }: { data: BarcelonaStreakGame[] }) {
  const max = Math.max(1, ...data.map((g) => g.goalsFor));
  return (
    <div className="card px-4 py-3">
      <p className="text-xs font-semibold text-[var(--text)]">Barcelona&rsquo;s first seven matches, 2026-27</p>
      <p className="text-[11px] text-[var(--text-faint)]">Every one a win. Bar length is goals scored.</p>
      <div className="mt-3 flex flex-col gap-2">
        {data.map((g) => (
          <div
            key={g.opponent}
            className="flex items-center gap-2"
            title={`${g.opponent} (${g.competition}): won ${g.goalsFor}-${g.goalsAgainst}`}
          >
            <span className="w-28 shrink-0 text-xs font-medium text-[var(--text-muted)]">{g.opponent}</span>
            <div className="h-4 flex-1 rounded bg-[var(--surface-muted)]">
              <div
                className={`h-4 rounded ${g.competition === "Champions League" ? "bg-[var(--text-faint)]" : "bg-[var(--accent)]"}`}
                style={{ width: `${Math.max(4, (g.goalsFor / max) * 100)}%` }}
              />
            </div>
            <span className="w-10 shrink-0 text-right text-xs font-bold tabular-nums text-[var(--text)]">
              {g.goalsFor}-{g.goalsAgainst}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-[var(--text-muted)]">
        Highlight-colour bars are La Liga, grey is the Champions League opener. Live table:{" "}
        <Link href="/laliga/standings" className="text-[var(--accent)] underline">
          /laliga/standings
        </Link>
        .
      </p>
    </div>
  );
}
