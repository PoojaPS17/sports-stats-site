import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { isLeague, LEAGUE_LABEL } from "@/lib/queries";
import { currentWeekIndex, weekIndexPath, weekNoun, weekPath } from "@/lib/matchweeks";
import { loadWeeks } from "@/lib/matchweekPage";
import { pageMeta } from "@/lib/metadata";

export const revalidate = 300;

export async function generateMetadata({ params }: { params: Promise<{ league: string }> }): Promise<Metadata> {
  const { league } = await params;
  if (!isLeague(league)) return {};
  return pageMeta(`${LEAGUE_LABEL[league]} ${weekNoun(league)}s`, `${LEAGUE_LABEL[league]} fixtures and results round by round.`, weekIndexPath(league));
}

// /[league]/matchweek → the current week's hub.
export default async function MatchweekRootPage({ params }: { params: Promise<{ league: string }> }) {
  const { league } = await params;
  if (!isLeague(league)) notFound();
  const ctx = await loadWeeks(league);
  if (!ctx || ctx.weeks.length === 0) notFound();
  redirect(weekPath(league, currentWeekIndex(ctx.weeks)));
}
