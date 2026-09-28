import Link from "next/link";
import type { OffseasonRecap as Recap } from "@/lib/offseason";
import { leagueNameWithArticle, type League } from "@/lib/leagues";
import { formatGameDate } from "@/lib/gameDay";
import { snapshotFromRecap } from "@/lib/leagueSnapshot";
import { GameCard } from "./GameCard";
import { SectionHeader } from "./SectionHeader";
import { LeagueSnapshot } from "./LeagueSnapshot";

// The league hub between seasons: instead of an empty window, the season just
// played — how it ended, the final table and the leading players — with links on
// to the full pages for each.
export function OffseasonRecap({ league, recap }: { league: League; recap: Recap }) {
  const ended = recap.endedOn ? formatGameDate(recap.endedOn, league, { month: "long", day: "numeric", year: "numeric" }, recap.endedOnLocal) : null;
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

      <LeagueSnapshot league={league} data={snapshotFromRecap(recap)} />
    </>
  );
}
