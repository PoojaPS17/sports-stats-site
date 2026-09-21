import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { isCricketLeague, scheduleWords } from "@/lib/leagues";
import { isLeague, isInternationalCricket, LEAGUE_LABEL, leagueNameWithArticle, getRecentAndUpcoming, getLatestResults, getMostRecentPlayedSeason, formatSeasonLabel } from "@/lib/queries";
import { getCurrentSeasonTeams } from "@/lib/related";
import { TeamLogo } from "@/components/TeamLogo";
import { pageMeta } from "@/lib/metadata";
import { GameCard } from "@/components/GameCard";
import { AdSlot } from "@/components/AdSlot";
import { SectionHeader } from "@/components/SectionHeader";
import { ImageActions } from "@/components/ImageActions";
import { ScoreboardExportCard, scoreboardExportWidth } from "@/components/ScoreboardExportCard";
import { PageHeader } from "@/components/PageHeader";
import { supportsMatchweeks, weekIndexPath, weekNoun } from "@/lib/matchweeks";
import { CalendarButton } from "@/components/CalendarButton";
import { getOffseasonRecap } from "@/lib/offseason";
import { OffseasonRecap } from "@/components/OffseasonRecap";
import { formatGameDate } from "@/lib/gameDay";
import { scoresImageDay } from "@/lib/gameDisplay";
import type { League } from "@/lib/queries";

export const revalidate = 15;

export async function generateMetadata({ params }: { params: Promise<{ league: string }> }): Promise<Metadata> {
  const { league } = await params;
  if (!isLeague(league)) return {};
  const label = LEAGUE_LABEL[league];
  const words = scheduleWords(league);
  if (league === "test") return pageMeta("Test Cricket Results", "Latest Test match results with full four-innings scorecards, and every men's Test since 2015.", "/test");
  if (isInternationalCricket(league)) return pageMeta(`${label} Results`, `Latest ${label} results with full scorecards.`, `/${league}`);
  return pageMeta(`${label} Scores & ${words.heading}`, `Latest ${label} results and upcoming ${words.upcoming} with ${words.start}, ${isCricketLeague(league) ? "scorecards" : "box scores"} and match stats.`, `/${league}`);
}

function groupByDay(league: League, games: Awaited<ReturnType<typeof getRecentAndUpcoming>>) {
  const groups = new Map<string, typeof games>();
  for (const g of games) {
    const key = formatGameDate(g.date, league, {
      weekday: "long",
      month: "long",
      day: "numeric",
    }, g.local_date);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(g);
  }
  return groups;
}

export default async function LeaguePage({ params }: { params: Promise<{ league: string }> }) {
  const { league } = await params;
  if (!isLeague(league)) notFound();

  const international = isInternationalCricket(league);
  const [games, teams, latest] = await Promise.all([getRecentAndUpcoming(league, 2, 7), getCurrentSeasonTeams(league), international ? getLatestResults(league, 12) : []]);
  // The international archive has no fixtures, so the rolling window would often be
  // empty; those pages open on the newest completed matches instead.
  const groups = groupByDay(league, international && games.length === 0 ? latest : games);
  // This page is a rolling recent-and-upcoming window, not a live-only view — for a
  // seasonal competition (NBA preseason, IPL/BBL between tournaments) that window can
  // be genuinely empty for months at a time. Rather than a bare "nothing here" that
  // reads like a bug, show how the last season ended, its table and its leaders.
  const recap = groups.size === 0 ? await getOffseasonRecap(league) : null;
  const mostRecentSeason = groups.size === 0 && !recap ? await getMostRecentPlayedSeason(league) : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={`${LEAGUE_LABEL[league]} Scores`} subtitle={international ? "Latest completed matches, with full scorecards" : `Results from the last two days and ${scheduleWords(league).upcoming} for the week ahead`}>
        {supportsMatchweeks(league) && (
          <Link href={weekIndexPath(league)} className="nav-pill nav-pill-active">
            Browse by {weekNoun(league).toLowerCase()} →
          </Link>
        )}
        {!international && <CalendarButton path={`/calendar/${league}`} />}
      </PageHeader>

      <AdSlot label={`${LEAGUE_LABEL[league]} top`} />

      {international && (
        <p className="text-xs text-[var(--text-muted)]">
          {league === "test"
            ? "Every men's Test since the start of 2015, with new results added daily: completed matches only. A Test in progress is on the cricket series pages."
            : league === "wodi" || league === "wt20i"
            ? "Women's internationals, refreshed daily: completed matches only, no fixtures or live scores."
            : "Men's internationals, refreshed daily: completed matches only, no fixtures or live scores."}
        </p>
      )}

      {recap && <OffseasonRecap league={league} recap={recap} />}

      {groups.size === 0 && !recap && (
        <div className="card px-5 py-6">
          <p className="font-semibold">{leagueNameWithArticle(league, true)} is between seasons.</p>
          <p className="mt-1 text-sm text-[var(--text-muted)]">No games in the last two days or the next week. Catch up on the most recent season instead.</p>
          {mostRecentSeason !== null && mostRecentSeason !== undefined && (
            <div className="mt-3 flex flex-wrap gap-4 text-sm font-semibold">
              <Link href={`/${league}/standings/${mostRecentSeason}`} className="text-[var(--accent)] hover:underline">
                {formatSeasonLabel(league, mostRecentSeason)} standings →
              </Link>
              <Link href={`/${league}/leaders`} className="text-[var(--accent)] hover:underline">
                Leaders →
              </Link>
              <Link href={`/${league}/teams`} className="text-[var(--accent)] hover:underline">
                Teams →
              </Link>
            </div>
          )}
        </div>
      )}

      {[...groups.entries()].map(([day, dayGames]) => (
        <section key={day}>
          <SectionHeader
            tools={
              <ImageActions
                filename={`${league}-scores-${scoresImageDay(league, dayGames[0]).iso}`}
                shareTitle={`${LEAGUE_LABEL[league]} scores, ${day}`}
                width={scoreboardExportWidth(league)}
                card={<ScoreboardExportCard league={league} title={`${LEAGUE_LABEL[league]} scores`} subtitle={`${day}, ${scoresImageDay(league, dayGames[0]).year}`} games={dayGames} />}
              />
            }
          >
            {day}
          </SectionHeader>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {dayGames.map((g) => (
              <GameCard key={g.espn_id} league={league} game={g} />
            ))}
          </div>
        </section>
      ))}

      {teams.length > 0 && (
        <section>
          <SectionHeader action={{ label: "All teams", href: `/${league}/teams` }}>Teams</SectionHeader>
          <div className="flex flex-wrap gap-2">
            {teams.map((t) => (
              <Link key={t.espn_id} href={`/${league}/teams/${t.slug}`} className="card flex items-center gap-2 px-3 py-1.5 text-sm font-medium hover:text-[var(--accent)]">
                <TeamLogo name={t.name} logoUrl={t.logo_url} color={t.color} size={18} />
                {t.name}
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
