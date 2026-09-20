import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLeague, LEAGUE_LABEL, formatSeasonLabel } from "@/lib/queries";
import { canonicalWeekIndexPath, getSeasonsWithGames, weekDateRange, weekNoun, weekPath } from "@/lib/matchweeks";
import { hasWeeks, isSeasonSegment, loadWeeks } from "@/lib/matchweekPage";
import { pageMeta } from "@/lib/metadata";
import { WeekHub, WeekIndex } from "@/components/WeekHub";

export const revalidate = 300;

export async function generateMetadata({ params }: { params: Promise<{ league: string; n: string }> }): Promise<Metadata> {
  const { league, n } = await params;
  if (!isLeague(league)) return {};
  const label = LEAGUE_LABEL[league];
  if (isSeasonSegment(n)) {
    // The latest season's list is also the hub at /[league]/matchweek, which is the canonical copy.
    const canonical = canonicalWeekIndexPath(league, Number(n), await getSeasonsWithGames(league));
    return pageMeta(`${label} ${weekNoun(league)}s ${formatSeasonLabel(league, Number(n))}`, `Every ${label} round of the ${formatSeasonLabel(league, Number(n))} season with results and tables.`, canonical);
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
    // No rounds is a 404 (as at the hub), so no 200 page canonicals to a missing one and the sitemap can mirror it.
    if (!hasWeeks(ctx)) notFound();
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
