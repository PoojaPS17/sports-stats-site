import Link from "next/link";
import { teamDisplayName } from "@/lib/teamName";
import { TeamLogo } from "./TeamLogo";
import type { League } from "@/lib/queries";
import { isSoccer, type ComputedTableRow, type TableScope } from "@/lib/analytics";

const SCOPE_NOTE: Record<TableScope, string> = {
  overall: "Regular-season results only.",
  home: "Only games played at home.",
  away: "Only games played away from home.",
  form: "Each team's last five results.",
};

export function ComputedStandingsTable({ league, rows, scope }: { league: League; rows: ComputedTableRow[]; scope: TableScope }) {
  const soccer = isSoccer(league);
  const numCell = "px-2 py-2.5 text-right tabular-nums";

  if (rows.length === 0) {
    return <p className="card px-4 py-6 text-sm text-[var(--text-muted)]">No completed games yet this season.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      <section className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse text-sm">
            <thead>
              <tr className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-faint)]">
                <th className="py-2 pl-4 text-left font-semibold">Team</th>
                <th className={`${numCell} font-semibold`}>P</th>
                <th className={`${numCell} font-semibold`}>W</th>
                {soccer && <th className={`${numCell} font-semibold`}>D</th>}
                <th className={`${numCell} font-semibold`}>L</th>
                <th className={`${numCell} font-semibold`}>{soccer ? "GF" : "PF"}</th>
                <th className={`${numCell} font-semibold`}>{soccer ? "GA" : "PA"}</th>
                <th className={`${numCell} font-semibold`}>{soccer ? "GD" : "Diff"}</th>
                <th className={`${numCell} font-semibold`}>{soccer ? "Pts" : "Pct"}</th>
                <th className="py-2 pl-3 pr-4 text-left font-semibold">Form</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const diff = r.goalsFor - r.goalsAgainst;
                return (
                  <tr key={r.team.espn_id} className="table-row">
                    <td className="py-2 pl-4">
                      <Link href={`/${league}/teams/${r.team.slug}`} className="flex items-center gap-2.5 whitespace-nowrap font-medium hover:text-[var(--accent)]">
                        <span className="w-5 text-right text-xs tabular-nums text-[var(--text-muted)]">{i + 1}</span>
                        <TeamLogo name={teamDisplayName(r.team.name)} logoUrl={r.team.logo_url} color={r.team.color} size={22} />
                        <span className="truncate">{teamDisplayName(r.team.name)}</span>
                      </Link>
                    </td>
                    <td className={`${numCell} text-[var(--text-muted)]`}>{r.played}</td>
                    <td className={numCell}>{r.wins}</td>
                    {soccer && <td className={numCell}>{r.draws}</td>}
                    <td className={numCell}>{r.losses}</td>
                    <td className={`${numCell} text-[var(--text-muted)]`}>{r.goalsFor}</td>
                    <td className={`${numCell} text-[var(--text-muted)]`}>{r.goalsAgainst}</td>
                    <td className={`${numCell} ${diff > 0 ? "text-[var(--win)]" : diff < 0 ? "text-[var(--loss)]" : "text-[var(--text-muted)]"}`}>
                      {diff > 0 ? `+${diff}` : diff}
                    </td>
                    <td className={`${numCell} font-bold`}>{soccer ? r.points : r.played ? (r.wins / r.played).toFixed(3) : "—"}</td>
                    <td className="py-2 pl-3 pr-4">
                      <span className="flex gap-1">
                        {[...r.form].reverse().map((f, j) => (
                          <span key={j} className={`result-badge result-${f.toLowerCase()}`}>
                            {f}
                          </span>
                        ))}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      <p className="text-xs text-[var(--text-faint)]">{SCOPE_NOTE[scope]} Computed from match results on ScoreDB, so it can differ from the official table if a result is missing.</p>
    </div>
  );
}
