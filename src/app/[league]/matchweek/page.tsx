import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLeague, LEAGUE_LABEL } from "@/lib/queries";
import { weekIndexPath, weekNoun } from "@/lib/matchweeks";
import { hasWeeks, loadWeeks } from "@/lib/matchweekPage";
import { pageMeta } from "@/lib/metadata";
import { WeekIndex } from "@/components/WeekHub";

export const revalidate = 300;

export async function generateMetadata({ params }: { params: Promise<{ league: string }> }): Promise<Metadata> {
  const { league } = await params;
  if (!isLeague(league)) return {};
  return pageMeta(`${LEAGUE_LABEL[league]} ${weekNoun(league)}s`, `${LEAGUE_LABEL[league]} fixtures and results round by round.`, weekIndexPath(league));
}

// /[league]/matchweek: the current season's round-by-round index (the same page as
// /[league]/matchweek/<current season>, which names this address as its canonical). It is linked from
// the sub-nav and listed in the sitemap, so it answers 200 itself rather than redirecting to a week.
export default async function MatchweekRootPage({ params }: { params: Promise<{ league: string }> }) {
  const { league } = await params;
  if (!isLeague(league)) notFound();
  const ctx = await loadWeeks(league);
  if (!hasWeeks(ctx)) notFound();
  return <WeekIndex league={league} season={ctx.season} weeks={ctx.weeks} seasons={ctx.seasons} isCurrentSeason={ctx.isCurrentSeason} />;
}
