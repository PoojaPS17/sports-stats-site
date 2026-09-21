import Link from "next/link";
import { teamDisplayName } from "@/lib/teamName";
import { TeamLogo } from "./TeamLogo";
import { isCricketLeague, isSoccerLeague, isCupCompetition, LEAGUE_LABEL, formatSeasonLabel } from "@/lib/queries";
import { hasTies } from "@/lib/leagues";
import type { StandingRow, League } from "@/lib/queries";
import { notStarted } from "@/lib/standingsOrder";
import { zonesFor } from "@/lib/standingsZones";

function StreakCell({ streak }: { streak: string | null }) {
  if (!streak) return <span className="text-[var(--text-faint)]">—</span>;
  const kind = streak[0]?.toUpperCase();
  const color = kind === "W" ? "text-[var(--win)]" : kind === "L" ? "text-[var(--loss)]" : "text-[var(--text-muted)]";
  return <span className={`font-semibold ${color}`}>{streak}</span>;
}

// How a standings list is split into tables, shared by the live page and its image:
// the NFL by division, everything else by conference (or as one table).
export function groupStandings(league: League, standings: StandingRow[]) {
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
  let sections = useDivisions ? [...byConference.entries()].sort((a, b) => a[0].localeCompare(b[0])) : [...byConference.entries()];
  // A domestic league is one table, and the feed's name for it varies by season and league
  // ("2026-2027 Italian Serie A", "2015/2016 Spanish Primera División", "Barclays Premier League
  // 2015-2016"), so it is headed by the league and the season instead. A cup's groups and stages
  // keep their own names.
  if (mode === "soccer" && !isCupCompetition(league) && sections.length === 1) {
    const season = formatSeasonLabel(league, sections[0][1][0]?.season ?? null);
    sections = [[season ? `${LEAGUE_LABEL[league]} ${season}` : LEAGUE_LABEL[league], sections[0][1]]];
  }
  return { mode, useDivisions, sections } as const;
}

export function StandingsTable({ league, standings }: { league: League; standings: StandingRow[] }) {
  const { mode, useDivisions, sections } = groupStandings(league, standings);

  if (standings.length === 0) {
    return <p className="card px-4 py-6 text-sm text-[var(--text-muted)]">No standings found for this season.</p>;
  }

  // Qualification / relegation bands: by position while the season runs, from ESPN's own notes once
  // it is over (src/lib/standingsZones.ts).
  const zones = mode === "soccer" ? zonesFor(league, sections) : null;
  const ties = mode === "default" && hasTies(league);
  const numCell = "px-2 py-2.5 text-right tabular-nums";

  return (
    <div className="flex flex-col gap-4">
      <div className={`grid gap-6 ${sections.length > 1 ? "lg:grid-cols-2" : ""}`} style={useDivisions ? { gridAutoFlow: "row dense" } : undefined}>
        {sections.map(([conference, rows]) => (
          <section key={conference} className="card overflow-hidden">
            <h2 className="table-head flex items-baseline justify-between gap-3 border-b border-[var(--border)] px-4 py-2.5">
              <span>{conference}</span>
              {notStarted(rows) && <span className="text-xs font-semibold normal-case tracking-normal text-[var(--text-muted)]">Season not started</span>}
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[440px] border-collapse text-sm">
                <thead>
                  <tr className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-faint)]">
                    <th className="py-2 pl-4 text-left font-semibold">Team</th>
                    {mode === "cricket" && <th className={`${numCell} font-semibold`}>M</th>}
                    {mode === "soccer" && <th className={`${numCell} font-semibold`}>P</th>}
                    <th className={`${numCell} font-semibold`}>W</th>
                    {mode === "soccer" && <th className={`${numCell} font-semibold`}>D</th>}
                    <th className={`${numCell} font-semibold`}>L</th>
                    {ties && <th className={`${numCell} font-semibold`}>T</th>}
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
                    const position = r.unranked ? null : i + 1;
                    const zone = zones && position !== null ? zones.zoneAt(rows, i) : null;
                    const gd = r.goals_for != null && r.goals_against != null ? r.goals_for - r.goals_against : null;
                    return (
                      <tr key={r.team_espn_id} className="table-row">
                        <td className="py-2 pl-4">
                          <Link href={`/${league}/teams/${r.slug}`} className="flex items-center gap-2.5 whitespace-nowrap font-medium hover:text-[var(--accent)]">
                            <span className="flex w-7 items-center gap-1.5">
                              <span className={`zone-marker ${zone?.cls ?? ""}`} title={zone?.label} />
                              <span className="w-4 text-right text-xs tabular-nums text-[var(--text-muted)]">{position ?? "–"}</span>
                            </span>
                            <TeamLogo name={teamDisplayName(r.name)} logoUrl={r.logo_url} color={r.color} size={22} />
                            <span className="truncate">{teamDisplayName(r.name)}</span>
                          </Link>
                        </td>
                        {mode === "cricket" && (
                          <td className={`${numCell} text-[var(--text-muted)]`}>{r.wins + r.losses + (r.no_result ?? 0)}</td>
                        )}
                        {mode === "soccer" && <td className={`${numCell} text-[var(--text-muted)]`}>{r.wins + (r.draws ?? 0) + r.losses}</td>}
                        <td className={numCell}>{r.wins}</td>
                        {mode === "soccer" && <td className={numCell}>{r.draws ?? 0}</td>}
                        <td className={numCell}>{r.losses}</td>
                        {ties && <td className={numCell}>{r.draws ?? 0}</td>}
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
      {zones && zones.legend.length > 0 && (
        <div className="flex flex-col gap-1.5 text-xs text-[var(--text-muted)]">
          <ul className="flex flex-wrap gap-x-5 gap-y-1.5">
            {zones.legend.map((z) => (
              <li key={z.label} className="flex items-center gap-1.5">
                <span className={`zone-marker ${z.cls}`} /> {z.label}
              </li>
            ))}
          </ul>
          {zones.caption && <p className="text-[var(--text-faint)]">{zones.caption}</p>}
        </div>
      )}
    </div>
  );
}
