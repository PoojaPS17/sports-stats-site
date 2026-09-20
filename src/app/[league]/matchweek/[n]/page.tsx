import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLeague, LEAGUE_LABEL, formatSeasonLabel } from "@/lib/queries";
import { canonicalWeekIndexPath, getSeasonsWithGames, weekDateRange, weekNoun, weekPath } from "@/lib/matchweeks";
import { hasWeeks, isSeasonSegment, loadWeeks } from "@/lib/matchweekPage";
import { pageMeta } from "@/lib/metadata";
import { WeekHub, WeekIndex } from "@/components/WeekHub";

export const revalidate = 300;

// An empty list, so nothing is built up front: each address is rendered on the first request and
// then served from the cache above until it goes stale. Without this export the page would be
// rendered again on every request and the revalidate above would never apply. Addresses that do
// not exist still render on demand and 404 (dynamicParams is left at its default).
export function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: { params: Promise<{ league: string; n: string }> }): Promise<Metadata> {
  const { league, n } = await params;
  if (!isLeague(league)) return {};
  const label = LEAGUE_LABEL[league];
  if (isSeasonSegment(n)) {
    // The latest season's list is also the hub at /[league]/matchweek, which is the canonical copy.
    const canonical = canonicalWeekIndexPath(league, Number(n), await getSeasonsWithGames(league));
    // A season with no rounds yet renders a short note (see the page): noindex, as at the hub.
    const noindex = !hasWeeks(await loadWeeks(league, n));
    return pageMeta(`${label} ${weekNoun(league)}s ${formatSeasonLabel(league, Number(n))}`, `Every ${label} round of the ${formatSeasonLabel(league, Number(n))} season with results and tables.`, canonical, { noindex });
  }
  const ctx = await loadWeeks(league);
  const week = ctx?.weeks.find((w) => w.index === Number(n));
  if (!ctx || !week) return {};
  return pageMeta(
    `${label} ${week.label} Fixtures & Results`,
    `${label} ${week.label} (${weekDateRange(week)}): every result and fixture, the table after the round, and the top performers.`,
    weekPath(league, week.index)
  );
}

export default async function MatchweekPage({ params }: { params: Promise<{ league: string; n: string }> }) {
  const { league, n } = await params;
  if (!isLeague(league)) notFound();

  // /epl/matchweek/2025 → season overview
  if (isSeasonSegment(n)) {
    const ctx = await loadWeeks(league, n);
    // A season with no games at all does not exist: a real 404. One with games but no rounds yet (preseason
    // only) is linked from the other seasons' pickers, so it answers 200 with a short note, noindex, and the
    // sitemap (which lists an index only when hasWeeks) leaves it out.
    if (!ctx) notFound();
    if (!hasWeeks(ctx)) return <WeekIndex league={league} season={ctx.season} weeks={[]} seasons={ctx.seasons} isCurrentSeason={ctx.isCurrentSeason} />;
    return <WeekIndex league={league} season={ctx.season} weeks={ctx.weeks} seasons={ctx.seasons} isCurrentSeason={ctx.isCurrentSeason} />;
  }

  // /epl/matchweek/5 → week 5 of the current season
  const index = Number(n);
  if (!Number.isInteger(index) || index < 1) notFound();
  const ctx = await loadWeeks(league);
  if (!ctx) notFound();
  const week = ctx.weeks.find((w) => w.index === index);
  if (!week) notFound();
  return <WeekHub league={league} season={ctx.season} weeks={ctx.weeks} week={week} seasons={ctx.seasons} isCurrentSeason />;
}
