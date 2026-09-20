import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLeague, LEAGUE_LABEL } from "@/lib/queries";
import { supportsMatchweeks, weekIndexPath, weekNoun } from "@/lib/matchweeks";
import { hasWeeks, loadWeeks } from "@/lib/matchweekPage";
import { pageMeta } from "@/lib/metadata";
import { WeekIndex } from "@/components/WeekHub";

export const revalidate = 300;

export async function generateMetadata({ params }: { params: Promise<{ league: string }> }): Promise<Metadata> {
  const { league } = await params;
  if (!isLeague(league)) return {};
  // With no rounds yet the page is a short note: it answers 200 (the sub-nav links it) but is not for the index.
  const ctx = supportsMatchweeks(league) ? await loadWeeks(league) : null;
  return pageMeta(`${LEAGUE_LABEL[league]} ${weekNoun(league)}s`, `${LEAGUE_LABEL[league]} fixtures and results round by round.`, weekIndexPath(league), { noindex: !hasWeeks(ctx) });
}

// /[league]/matchweek: the current season's round-by-round index (the same page as
// /[league]/matchweek/<current season>, which names this address as its canonical). It is linked from
// the sub-nav and listed in the sitemap, so it answers 200 itself rather than redirecting to a week.
// The sub-nav links it for every league with rounds, so it is never a 404 for one: before the first
// regular-season round (the newest season has only preseason games, or no games yet) it shows a short
// note instead, is noindex, and stays out of the sitemap, which lists it only when hasWeeks.
export default async function MatchweekRootPage({ params }: { params: Promise<{ league: string }> }) {
  const { league } = await params;
  if (!isLeague(league) || !supportsMatchweeks(league)) notFound();
  const ctx = await loadWeeks(league);
  if (!ctx || !hasWeeks(ctx)) {
    return <WeekIndex league={league} season={ctx ? ctx.season : null} weeks={[]} seasons={ctx ? ctx.seasons : []} isCurrentSeason />;
  }
  return <WeekIndex league={league} season={ctx.season} weeks={ctx.weeks} seasons={ctx.seasons} isCurrentSeason={ctx.isCurrentSeason} />;
}
