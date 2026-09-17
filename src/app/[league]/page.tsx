import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { isLeague, LEAGUE_LABEL, getRecentAndUpcoming, getMostRecentPlayedSeason, formatSeasonLabel } from "@/lib/queries";
import { pageMeta } from "@/lib/metadata";
import { GameCard } from "@/components/GameCard";
import { AdSlot } from "@/components/AdSlot";
import { SectionHeader } from "@/components/SectionHeader";
import { PageHeader } from "@/components/PageHeader";
import { supportsMatchweeks, weekIndexPath, weekNoun } from "@/lib/matchweeks";
import { CalendarButton } from "@/components/CalendarButton";

export const revalidate = 60;

export async function generateMetadata({ params }: { params: Promise<{ league: string }> }): Promise<Metadata> {
  const { league } = await params;
  if (!isLeague(league)) return {};
  const label = LEAGUE_LABEL[league];
  return pageMeta(`${label} Scores & Fixtures`, `Latest ${label} results and upcoming fixtures with kickoff times, box scores and match stats.`, `/${league}`);
}

function groupByDay(games: Awaited<ReturnType<typeof getRecentAndUpcoming>>) {
  const groups = new Map<string, typeof games>();
  for (const g of games) {
    const key = new Date(g.date).toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(g);
  }
  return groups;
}

export default async function LeaguePage({ params }: { params: Promise<{ league: string }> }) {
  const { league } = await params;
  if (!isLeague(league)) notFound();

  const games = await getRecentAndUpcoming(league, 2, 7);
  const groups = groupByDay(games);
  // This page is a rolling recent-and-upcoming window, not a live-only view — for a
  // seasonal competition (NBA preseason, IPL/BBL between tournaments) that window can
  // be genuinely empty for months at a time. Rather than a bare "nothing here" that
  // reads like a bug, point at the most recent season's actual results.
  const mostRecentSeason = groups.size === 0 ? await getMostRecentPlayedSeason(league) : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={`${LEAGUE_LABEL[league]} Scores`} subtitle="Results from the last two days and fixtures for the week ahead">
        {supportsMatchweeks(league) && (
          <Link href={weekIndexPath(league)} className="nav-pill nav-pill-active">
            Browse by {weekNoun(league).toLowerCase()} →
          </Link>
        )}
        <CalendarButton path={`/calendar/${league}`} />
      </PageHeader>

      <AdSlot label={`${LEAGUE_LABEL[league]} top`} />

      {groups.size === 0 && (
        <div className="card px-5 py-6">
          <p className="font-semibold">The {LEAGUE_LABEL[league]} is between seasons.</p>
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
          <SectionHeader>{day}</SectionHeader>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {dayGames.map((g) => (
              <GameCard key={g.espn_id} league={league} game={g} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
