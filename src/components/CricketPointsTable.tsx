import { SectionHeader } from "@/components/SectionHeader";
import { TeamLogo } from "@/components/TeamLogo";
import { teamDisplayName } from "@/lib/teamName";
import type { CricketSeriesStandings } from "@/lib/cricketSeriesStandings";

// A series' points table as ESPN publishes it: one table per group, the columns the feed carries.
// Points are the feed's own (bonus-point competitions exist), never a count of results.
export function CricketPointsTable({ table }: { table: CricketSeriesStandings }) {
  const numCell = "px-2 py-2.5 text-right tabular-nums";
  const cols = ["M", "W", "L", ...(table.hasTies ? ["T"] : []), "NR", "Pts", ...(table.hasNrr ? ["NRR"] : [])];
  return (
    <section className="flex flex-col gap-3">
      <SectionHeader description="Points and net run rate as published in the ESPN feed, refreshed every five minutes">Points table</SectionHeader>
      {table.groups.map((group, gi) => (
        <div key={group.name ?? gi} className="card overflow-hidden">
          {group.name && <h3 className="border-b border-[var(--border)] bg-[var(--surface-muted)] px-4 py-2.5 text-sm font-bold">{group.name}</h3>}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[460px] border-collapse text-sm">
              <thead>
                <tr className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-faint)]">
                  <th className="py-2 pl-4 text-left font-semibold">Team</th>
                  {cols.map((c) => (
                    <th key={c} className={`${numCell} font-semibold`}>
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {group.rows.map((r) => (
                  <tr key={r.teamId || r.team} className="table-row">
                    <td className="py-2 pl-4">
                      <span className="flex items-center gap-2.5 whitespace-nowrap font-medium">
                        <span className="w-5 text-right text-xs tabular-nums text-[var(--text-muted)]">{r.rank}</span>
                        <TeamLogo name={teamDisplayName(r.team)} logoUrl={r.logo} size={22} />
                        <span className="truncate">{teamDisplayName(r.team)}</span>
                        {r.qualified === true && table.hasQualified && (
                          <span className="rounded-md bg-[var(--sig-soft)] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--sig-ink)]" title="Qualified">
                            Q
                          </span>
                        )}
                      </span>
                    </td>
                    <td className={`${numCell} text-[var(--text-muted)]`}>{r.played}</td>
                    <td className={numCell}>{r.won}</td>
                    <td className={numCell}>{r.lost}</td>
                    {table.hasTies && <td className={numCell}>{r.tied}</td>}
                    <td className={numCell}>{r.noResult}</td>
                    <td className={`${numCell} font-bold`}>{r.points}</td>
                    {table.hasNrr && <td className={numCell}>{r.nrr ?? "-"}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
      {table.hasQualified && <p className="text-xs text-[var(--text-muted)]">Q: Qualified for the next stage.</p>}
    </section>
  );
}
