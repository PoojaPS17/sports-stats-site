import Link from "next/link";
import type { OffseasonRecap as Recap } from "@/lib/offseason";
import { leagueNameWithArticle, isSoccerLeague, isCricketLeague, type League } from "@/lib/leagues";
import { formatGameDate } from "@/lib/gameDay";
import { formatWinLossTie } from "@/lib/teamSummary";
import { GameCard } from "./GameCard";
import { SectionHeader } from "./SectionHeader";
import { TeamLogo } from "./TeamLogo";

function record(league: League, r: Recap["table"][number]): string {
  if (isSoccerLeague(league)) return `${r.wins}-${r.draws ?? 0}-${r.losses}`;
  if (isCricketLeague(league)) return `${r.wins}-${r.losses}${r.no_result ? `-${r.no_result}` : ""}`;
  return formatWinLossTie(r.wins, r.losses, r.draws);
}

// The league hub between seasons: instead of an empty window, the season just
// played — how it ended, the final table and the leading players — with links on
// to the full pages for each.
export function OffseasonRecap({ league, recap }: { league: League; recap: Recap }) {
  const ended = recap.endedOn ? formatGameDate(recap.endedOn, league, { month: "long", day: "numeric", year: "numeric" }) : null;
  // World Cups are editions, not seasons.
  const noun = league === "cwc" || league === "t20wc" || league === "wcwc" || league === "wt20wc" ? "tournament" : "season";
  // A season with fixtures still to come is in progress: it says when the next matchday is, never that it ended.
  const inSeason = !recap.seasonOver;
  const next = recap.nextFixtureOn ? formatGameDate(recap.nextFixtureOn, league, { weekday: "long", month: "long", day: "numeric", year: "numeric" }) : null;
  const dayWord = league === "nba" || league === "nfl" ? "game day" : "matchday";
  const closingTitle = inSeason ? "Latest results" : recap.playoffs.length > 0 ? `How the ${recap.seasonLabel} ${noun} ended` : `Final results of ${recap.seasonLabel}`;

  return (
    <>
      <div className="card px-5 py-5">
        <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">{inSeason ? "No games this week" : noun === "season" ? "Between seasons" : "Between tournaments"}</p>
        <p className="mt-1 text-lg font-bold tracking-tight">
          {inSeason
            ? `${leagueNameWithArticle(league, true)} ${recap.seasonLabel} ${noun} is in progress. Next ${dayWord}: ${next}.`
            : `${leagueNameWithArticle(league, true)} ${recap.seasonLabel} ${noun} ${ended ? `ended on ${ended}` : "is complete"}.`}
        </p>
        {recap.champion && (
          <p className="mt-1 text-sm">
            <span className="mr-2 text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">Champions</span>
            <Link href={`/${league}/teams/${recap.champion.slug}`} className="font-semibold hover:underline">
              {recap.champion.name}
            </Link>
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-4 text-sm font-semibold">
          <Link href={`/${league}/standings/${recap.season}`} className="text-[var(--accent)] hover:underline">
            {recap.seasonLabel} standings →
          </Link>
          <Link href={`/${league}/leaders`} className="text-[var(--accent)] hover:underline">
            Leaders →
          </Link>
          <Link href={`/${league}/teams`} className="text-[var(--accent)] hover:underline">
            Teams →
          </Link>
        </div>
      </div>

      {recap.closingGames.length > 0 && (
        <section>
          <SectionHeader action={{ label: `${noun === "season" ? "Season" : "Tournament"} summary`, href: `/${league}/standings/${recap.season}` }}>{closingTitle}</SectionHeader>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {recap.closingGames.map((g) => (
              <GameCard key={g.espn_id} league={league} game={g} />
            ))}
          </div>
        </section>
      )}

      {(recap.table.length > 0 || recap.leaders.length > 0) && (
        <div className="grid gap-6 lg:grid-cols-2">
          {recap.table.length > 0 && (
            <section>
              <SectionHeader action={{ label: `All ${recap.tableSize} teams`, href: `/${league}/standings/${recap.season}` }}>
                {inSeason ? "Table" : "Final table"}, {recap.seasonLabel}
              </SectionHeader>
              <ol className="card overflow-hidden">
                {recap.table.map((r, i) => (
                  <li key={r.team_espn_id} className="table-row first:border-t-0">
                    <Link href={`/${league}/teams/${r.slug}`} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm">
                      <span className="flex min-w-0 items-center gap-2.5">
                        <span className={`w-5 text-right text-xs tabular-nums ${i === 0 ? "font-bold text-[var(--accent)]" : "text-[var(--text-muted)]"}`}>{i + 1}</span>
                        <TeamLogo name={r.name} logoUrl={r.logo_url} color={r.color} size={24} />
                        <span className="truncate font-semibold">{r.name}</span>
                      </span>
                      <span className="flex shrink-0 items-baseline gap-3 tabular-nums">
                        <span className="text-xs text-[var(--text-muted)]">{record(league, r)}</span>
                        {r.points !== null && (
                          <span className="text-base font-bold">
                            {r.points} <span className="text-[11px] font-semibold uppercase text-[var(--text-faint)]">pts</span>
                          </span>
                        )}
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {recap.leaders.length > 0 && (
            <section>
              <SectionHeader action={{ label: "All leaders", href: `/${league}/leaders` }}>Season leaders, {recap.seasonLabel}</SectionHeader>
              <div className="card divide-y divide-[var(--border)]">
                {recap.leaders.map((board) => (
                  <div key={board.label} className="px-4 py-3">
                    <h3 className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">{board.label}</h3>
                    <ol className="mt-1.5 flex flex-col gap-1.5">
                      {board.rows.map((row, rank) => (
                        <li key={row.player_espn_id}>
                          <Link href={`/${league}/players/${row.slug}`} className="flex items-center justify-between gap-2 text-sm">
                            <span className="flex min-w-0 items-center gap-2.5">
                              <span className={`w-4 text-right text-xs tabular-nums ${rank === 0 ? "font-bold text-[var(--accent)]" : "text-[var(--text-muted)]"}`}>{rank + 1}</span>
                              <TeamLogo name={row.name} logoUrl={row.headshot_url} size={24} />
                              <span className="min-w-0 truncate">
                                <span className="font-semibold">{row.name}</span>
                                {row.team_name && <span className="ml-1.5 text-xs text-[var(--text-muted)]">{row.team_name}</span>}
                              </span>
                            </span>
                            <span className="shrink-0 font-bold tabular-nums">
                              {row.value} <span className="text-[11px] font-semibold uppercase text-[var(--text-faint)]">{board.unit}</span>
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ol>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </>
  );
}
