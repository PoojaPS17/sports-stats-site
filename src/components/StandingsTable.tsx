import Link from "next/link";
import { teamDisplayName } from "@/lib/teamName";
import { TeamLogo } from "./TeamLogo";
import { isCricketLeague, isSoccerLeague } from "@/lib/queries";
import type { StandingRow, League } from "@/lib/queries";

interface Zone {
  cls: string;
  label: string;
}

// Qualification / relegation zones. Domestic leagues: a full table only (20 teams, or
// the Bundesliga's 18 with its relegation play-off place), so a partial table isn't
// mislabelled. Champions League: the 36-team league phase (top
// eight straight to the round of 16, ninth to 24th into the playoffs, the rest out)
// or a four-team group from the old format (top two through, third to the Europa
// League). Any other shape gets no zones rather than a guess.
function zoneRules(league: League, total: number): ((position: number) => Zone | null) | null {
  if (league === "ucl") {
    if (total === 36) return (p) => (p <= 8 ? { cls: "zone-1", label: "Round of 16" } : p <= 24 ? { cls: "zone-2", label: "Knockout playoffs" } : { cls: "zone-3", label: "Eliminated" });
    if (total === 4) return (p) => (p <= 2 ? { cls: "zone-1", label: "Round of 16" } : p === 3 ? { cls: "zone-2", label: "Europa League" } : { cls: "zone-3", label: "Eliminated" });
    return null;
  }
  if (league === "bundesliga") {
    if (total !== 18) return null;
    return (p) => (p <= 4 ? { cls: "zone-1", label: "Champions League" } : p === 5 ? { cls: "zone-2", label: "Europa League" } : p === 16 ? { cls: "zone-2", label: "Relegation play-off" } : p >= 17 ? { cls: "zone-3", label: "Relegation" } : null);
  }
  if (total !== 20) return null;
  return (p) => (p <= 4 ? { cls: "zone-1", label: "Champions League" } : p === 5 ? { cls: "zone-2", label: "Europa League" } : p >= 18 ? { cls: "zone-3", label: "Relegation" } : null);
}

function legendFor(league: League, total: number): Zone[] {
  const rules = zoneRules(league, total);
  if (!rules) return [];
  const seen = new Map<string, Zone>();
  for (let p = 1; p <= total; p++) {
    const z = rules(p);
    if (z && !seen.has(z.label)) seen.set(z.label, z);
  }
  return [...seen.values()];
}

function StreakCell({ streak }: { streak: string | null }) {
  if (!streak) return <span className="text-[var(--text-faint)]">—</span>;
  const kind = streak[0]?.toUpperCase();
  const color = kind === "W" ? "text-[var(--win)]" : kind === "L" ? "text-[var(--loss)]" : "text-[var(--text-muted)]";
  return <span className={`font-semibold ${color}`}>{streak}</span>;
}

export function StandingsTable({ league, standings }: { league: League; standings: StandingRow[] }) {
  const mode = isSoccerLeague(league) ? "soccer" : isCricketLeague(league) ? "cricket" : "default";
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

  // Zones apply per section (a cup's groups are four-team tables of their own).
  const sectionSize = sections.length ? sections[0][1].length : 0;
  const showZones = mode === "soccer" && sections.every(([, rows]) => rows.length === sectionSize) && zoneRules(league, sectionSize) !== null;
  const legend = showZones ? legendFor(league, sectionSize) : [];
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
                    const zone = showZones ? zoneRules(league, rows.length)?.(position) ?? null : null;
                    const gd = r.goals_for != null && r.goals_against != null ? r.goals_for - r.goals_against : null;
                    return (
                      <tr key={r.team_espn_id} className="table-row">
                        <td className="py-2 pl-4">
                          <Link href={`/${league}/teams/${r.slug}`} className="flex items-center gap-2.5 whitespace-nowrap font-medium hover:text-[var(--accent)]">
                            <span className="flex w-7 items-center gap-1.5">
                              <span className={`zone-marker ${zone?.cls ?? ""}`} title={zone?.label} />
                              <span className="w-4 text-right text-xs tabular-nums text-[var(--text-muted)]">{position}</span>
                            </span>
                            <TeamLogo name={teamDisplayName(r.name)} logoUrl={r.logo_url} color={r.color} size={22} />
                            <span className="truncate">{teamDisplayName(r.name)}</span>
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
      {legend.length > 0 && (
        <ul className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-[var(--text-muted)]">
          {legend.map((z) => (
            <li key={z.label} className="flex items-center gap-1.5">
              <span className={`zone-marker ${z.cls}`} /> {z.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
