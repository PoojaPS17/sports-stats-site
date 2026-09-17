import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLeague, LEAGUE_LABEL, formatSeasonLabel } from "@/lib/queries";
import { weekDateRange, weekPath } from "@/lib/matchweeks";
import { isSeasonSegment, loadWeeks } from "@/lib/matchweekPage";
import { pageMeta } from "@/lib/metadata";
import { WeekHub } from "@/components/WeekHub";

// A completed season's rounds never change.
export const revalidate = 86400;

export async function generateMetadata({ params }: { params: Promise<{ league: string; n: string; week: string }> }): Promise<Metadata> {
  const { league, n, week: w } = await params;
  if (!isLeague(league) || !isSeasonSegment(n)) return {};
  const ctx = await loadWeeks(league, n);
  const week = ctx?.weeks.find((x) => x.index === Number(w));
  if (!ctx || !week) return {};
  const label = LEAGUE_LABEL[league];
  return pageMeta(
    `${label} ${week.label} ${formatSeasonLabel(league, ctx.season)} Results`,
    `${label} ${week.label} of the ${formatSeasonLabel(league, ctx.season)} season (${weekDateRange(week)}): every result, the table after the round, and the top performers.`,
    weekPath(league, week.index, ctx.season)
  );
}

// /epl/matchweek/2025/5 → week 5 of the 2025-26 season
export default async function MatchweekSeasonPage({ params }: { params: Promise<{ league: string; n: string; week: string }> }) {
  const { league, n, week: w } = await params;
  if (!isLeague(league) || !isSeasonSegment(n)) notFound();
  const index = Number(w);
  if (!Number.isInteger(index) || index < 1) notFound();
  const ctx = await loadWeeks(league, n);
  if (!ctx) notFound();
  const week = ctx.weeks.find((x) => x.index === index);
  if (!week) notFound();
  return <WeekHub league={league} season={ctx.season} weeks={ctx.weeks} week={week} seasons={ctx.seasons} isCurrentSeason={ctx.isCurrentSeason} />;
}
