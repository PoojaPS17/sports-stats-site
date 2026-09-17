import Link from "next/link";
import { TeamLogo } from "./TeamLogo";
import { isCricketLeague } from "@/lib/queries";
import type { StandingRow, League } from "@/lib/queries";

// Qualification / relegation zones for a full 20-team domestic league table. Only
// applied when the table has exactly 20 rows so a partial or cup table isn't
// mislabelled.
function soccerZone(position: number, total: number): { cls: string; label: string } | null {
  if (total !== 20) return null;
  if (position <= 4) return { cls: "zone-1", label: "Champions League" };
  if (position === 5) return { cls: "zone-2", label: "Europa League" };
  if (position >= 18) return { cls: "zone-3", label: "Relegation" };
  return null;
}

function StreakCell({ streak }: { streak: string | null }) {
  if (!streak) return <span className="text-[var(--text-faint)]">—</span>;
  const kind = streak[0]?.toUpperCase();
  const color = kind === "W" ? "text-[var(--win)]" : kind === "L" ? "text-[var(--loss)]" : "text-[var(--text-muted)]";
  return <span className={`font-semibold ${color}`}>{streak}</span>;
}

export function StandingsTable({ league, standings }: { league: League; standings: StandingRow[] }) {
  const mode = league === "epl" || league === "laliga" ? "soccer" : isCricketLeague(league) ? "cricket" : "default";
  // The NFL table is conventionally shown by division; everything else by
  // conference (or as one table). Divisions are only stored for the NFL.
  const useDivisions = league === "nfl" && standings.every((r) => r.division);
  const byConference = new Map<string, StandingRow[]>();
  for (const row of standings) {
    const key = useDivisions ? row.division! : (row.conference ?? "All Teams");
    if (!byConference.has(key)) byConference.set(key, []);
    byConference.get(key)!.push(row);
  }

  // Divisions read in the conventional order (AFC East, North, South, West, then NFC),
  // which is also alphabetical.
  const sections = useDivisions ? [...byConference.entries()].sort((a, b) => a[0].localeCompare(b[0])) : [...byConference.entries()];

  if (standings.length === 0) {
    return <p className="card px-4 py-6 text-sm text-[var(--text-muted)]">No standings found for this season.</p>;
  }

  const showZones = mode === "soccer" && standings.length === 20;
  const numCell = "px-2 py-2.5 text-right tabular-nums";

  return (
    <div className="flex flex-col gap-4">
      <div className={`grid gap-6 ${byConference.size > 1 ? "lg:grid-cols-2" : ""}`} style={useDivisions ? { gridAutoFlow: "row dense" } : undefined}>
        {sections.map(([conference, rows]) => (
          <section key={conference} className="card overflow-hidden">
            <h2 className="table-head border-b border-[var(--border)] px-4 py-2.5">{conference}</h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[440px] border-collapse text-sm">
                <thead>
                  <tr className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-faint)]">
                    <th className="py-2 pl-4 text-left font-semibold">Team</th>
                    {mode === "cricket" && <th className={`${numCell} font-semibold`}>M</th>}
                    <th className={`${numCell} font-semibold`}>W</th>
                    {mode === "soccer" && <th className={`${numCell} font-semibold`}>D</th>}
                    <th className={`${numCell} font-semibold`}>L</th>
                    {mode === "soccer" && (
                      <>
                        <th className={`${numCell} font-semibold`}>GF</th>
                        <th className={`${numCell} font-semibold`}>GA</th>
                        <th className={`${numCell} font-semibold`}>GD</th>
                        <th className="py-2 pl-2 pr-4 text-right font-semibold">Pts</th>
                      </>
                    )}
                    {mode === "cricket" && (
                      <>
                        <th className={`${numCell} font-semibold`}>NR</th>
                        <th className={`${numCell} font-semibold`}>Pts</th>
                        <th className="py-2 pl-2 pr-4 text-right font-semibold">NRR</th>
                      </>
                    )}
                    {mode === "default" && (
                      <>
                        <th className={`${numCell} font-semibold`}>Pct</th>
                        <th className="py-2 pl-2 pr-4 text-right font-semibold">Streak</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => {
                    const position = i + 1;
                    const zone = showZones ? soccerZone(position, rows.length) : null;
                    const gd = r.goals_for != null && r.goals_against != null ? r.goals_for - r.goals_against : null;
                    return (
                      <tr key={r.team_espn_id} className="table-row">
                        <td className="py-2 pl-4">
                          <Link href={`/${league}/teams/${r.slug}`} className="flex items-center gap-2.5 whitespace-nowrap font-medium hover:text-[var(--accent)]">
                            <span className="flex w-7 items-center gap-1.5">
                              <span className={`zone-marker ${zone?.cls ?? ""}`} title={zone?.label} />
                              <span className="w-4 text-right text-xs tabular-nums text-[var(--text-muted)]">{position}</span>
                            </span>
                            <TeamLogo name={r.name} logoUrl={r.logo_url} color={r.color} size={22} />
                            <span className="truncate">{r.name}</span>
                          </Link>
                        </td>
                        {mode === "cricket" && (
                          <td className={`${numCell} text-[var(--text-muted)]`}>{r.wins + r.losses + (r.no_result ?? 0)}</td>
                        )}
                        <td className={numCell}>{r.wins}</td>
                        {mode === "soccer" && <td className={numCell}>{r.draws ?? 0}</td>}
                        <td className={numCell}>{r.losses}</td>
                        {mode === "soccer" && (
                          <>
                            <td className={`${numCell} text-[var(--text-muted)]`}>{r.goals_for ?? "—"}</td>
                            <td className={`${numCell} text-[var(--text-muted)]`}>{r.goals_against ?? "—"}</td>
                            <td className={`${numCell} ${gd == null ? "text-[var(--text-muted)]" : gd > 0 ? "text-[var(--win)]" : gd < 0 ? "text-[var(--loss)]" : "text-[var(--text-muted)]"}`}>
                              {gd == null ? "—" : gd > 0 ? `+${gd}` : gd}
                            </td>
                            <td className="py-2.5 pl-2 pr-4 text-right font-bold tabular-nums">{r.points ?? "—"}</td>
                          </>
                        )}
                        {mode === "cricket" && (
                          <>
                            <td className={`${numCell} text-[var(--text-muted)]`}>{r.no_result ?? 0}</td>
                            <td className={`${numCell} font-bold`}>{r.points ?? "—"}</td>
                            <td className="py-2.5 pl-2 pr-4 text-right tabular-nums text-[var(--text-muted)]">
                              {r.net_run_rate != null ? Number(r.net_run_rate).toFixed(3) : "—"}
                            </td>
                          </>
                        )}
                        {mode === "default" && (
                          <>
                            <td className={`${numCell} text-[var(--text-muted)]`}>{Number(r.win_percent).toFixed(3)}</td>
                            <td className="py-2.5 pl-2 pr-4 text-right tabular-nums">
                              <StreakCell streak={r.streak} />
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>
      {showZones && (
        <ul className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-[var(--text-muted)]">
          <li className="flex items-center gap-1.5">
            <span className="zone-marker zone-1" /> Champions League
          </li>
          <li className="flex items-center gap-1.5">
            <span className="zone-marker zone-2" /> Europa League
          </li>
          <li className="flex items-center gap-1.5">
            <span className="zone-marker zone-3" /> Relegation
          </li>
        </ul>
      )}
    </div>
  );
}
