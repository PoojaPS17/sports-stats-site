import Link from "next/link";
import { TeamLogo } from "./TeamLogo";
import { isCricketLeague } from "@/lib/queries";
import type { StandingRow, League } from "@/lib/queries";

export function StandingsTable({ league, standings }: { league: League; standings: StandingRow[] }) {
  const mode = league === "epl" || league === "laliga" ? "soccer" : isCricketLeague(league) ? "cricket" : "default";
  const byConference = new Map<string, StandingRow[]>();
  for (const row of standings) {
    const key = row.conference ?? "All Teams";
    if (!byConference.has(key)) byConference.set(key, []);
    byConference.get(key)!.push(row);
  }

  if (standings.length === 0) {
    return <p className="card px-4 py-6 text-sm text-[var(--text-muted)]">No standings found for this season.</p>;
  }

  return (
    <div className={`grid gap-6 ${byConference.size > 1 ? "lg:grid-cols-2" : ""}`}>
      {[...byConference.entries()].map(([conference, rows]) => (
        <section key={conference} className="card overflow-hidden">
          <h2 className="border-b border-[var(--border)] bg-[var(--surface-muted)] px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">
            {conference}
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] border-collapse text-sm">
              <thead>
                <tr className="text-left text-xs text-[var(--text-muted)]">
                  <th className="py-2 pl-4 font-medium">Team</th>
                  {mode === "cricket" && <th className="px-2 py-2 text-right font-medium">M</th>}
                  <th className="px-2 py-2 text-right font-medium">W</th>
                  {mode === "soccer" && <th className="px-2 py-2 text-right font-medium">D</th>}
                  <th className="px-2 py-2 text-right font-medium">L</th>
                  {mode === "soccer" && (
                    <>
                      <th className="px-2 py-2 text-right font-medium">GF</th>
                      <th className="px-2 py-2 text-right font-medium">GA</th>
                      <th className="px-2 py-2 text-right font-medium">GD</th>
                      <th className="py-2 pl-2 pr-4 text-right font-medium">PTS</th>
                    </>
                  )}
                  {mode === "cricket" && (
                    <>
                      <th className="px-2 py-2 text-right font-medium">NR</th>
                      <th className="px-2 py-2 text-right font-medium">PTS</th>
                      <th className="py-2 pl-2 pr-4 text-right font-medium">NRR</th>
                    </>
                  )}
                  {mode === "default" && (
                    <>
                      <th className="px-2 py-2 text-right font-medium">PCT</th>
                      <th className="py-2 pl-2 pr-4 text-right font-medium">Streak</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr
                    key={r.team_espn_id}
                    className="border-t border-[var(--border)] transition hover:bg-[var(--surface-muted)]"
                  >
                    <td className="py-2 pl-4">
                      <Link href={`/${league}/teams/${r.slug}`} className="flex items-center gap-2.5 whitespace-nowrap font-medium">
                        <span className="w-4 text-xs text-[var(--text-muted)]">{i + 1}</span>
                        <TeamLogo name={r.name} logoUrl={r.logo_url} color={r.color} size={22} />
                        {r.name}
                      </Link>
                    </td>
                    {mode === "cricket" && (
                      <td className="px-2 py-2 text-right tabular-nums text-[var(--text-muted)]">
                        {r.wins + r.losses + (r.no_result ?? 0)}
                      </td>
                    )}
                    <td className="px-2 py-2 text-right tabular-nums">{r.wins}</td>
                    {mode === "soccer" && <td className="px-2 py-2 text-right tabular-nums">{r.draws ?? 0}</td>}
                    <td className="px-2 py-2 text-right tabular-nums">{r.losses}</td>
                    {mode === "soccer" && (
                      <>
                        <td className="px-2 py-2 text-right tabular-nums text-[var(--text-muted)]">{r.goals_for ?? "—"}</td>
                        <td className="px-2 py-2 text-right tabular-nums text-[var(--text-muted)]">{r.goals_against ?? "—"}</td>
                        <td className="px-2 py-2 text-right tabular-nums text-[var(--text-muted)]">
                          {r.goals_for != null && r.goals_against != null ? r.goals_for - r.goals_against : "—"}
                        </td>
                        <td className="py-2 pl-2 pr-4 text-right font-bold tabular-nums">{r.points ?? "—"}</td>
                      </>
                    )}
                    {mode === "cricket" && (
                      <>
                        <td className="px-2 py-2 text-right tabular-nums text-[var(--text-muted)]">{r.no_result ?? 0}</td>
                        <td className="px-2 py-2 text-right font-bold tabular-nums">{r.points ?? "—"}</td>
                        <td className="py-2 pl-2 pr-4 text-right tabular-nums text-[var(--text-muted)]">
                          {r.net_run_rate != null ? Number(r.net_run_rate).toFixed(3) : "—"}
                        </td>
                      </>
                    )}
                    {mode === "default" && (
                      <>
                        <td className="px-2 py-2 text-right tabular-nums text-[var(--text-muted)]">{Number(r.win_percent).toFixed(3)}</td>
                        <td className="py-2 pl-2 pr-4 text-right tabular-nums text-[var(--text-muted)]">{r.streak ?? "—"}</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}
