import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLeague, LEAGUE_LABEL, getStandings, getStandingsSeasons, getSeasonPlayoffGames, formatSeasonLabel } from "@/lib/queries";
import { summarizePlayoffs } from "@/lib/seasonSummary";
import { supportsScoreAnalytics } from "@/lib/analytics";
import { pageMeta } from "@/lib/metadata";
import { AdSlot } from "@/components/AdSlot";
import { StandingsTable } from "@/components/StandingsTable";
import { SeasonTabs } from "@/components/SeasonTabs";
import { SeasonSummary } from "@/components/SeasonSummary";
import { PageHeader } from "@/components/PageHeader";
import { StandingsViewTabs } from "@/components/StandingsViewTabs";

export const revalidate = 300;

export async function generateMetadata({ params }: { params: Promise<{ league: string }> }): Promise<Metadata> {
  const { league } = await params;
  if (!isLeague(league)) return {};
  const label = LEAGUE_LABEL[league];
  return pageMeta(`${label} Standings`, `Current ${label} table with wins, losses, points and streaks, plus home, away and form tables and ten seasons of past standings.`);
}

export default async function StandingsPage({ params }: { params: Promise<{ league: string }> }) {
  const { league } = await params;
  if (!isLeague(league)) notFound();

  const [standings, seasons] = await Promise.all([getStandings(league), getStandingsSeasons(league)]);
  const activeSeason = standings[0]?.season ?? seasons[0] ?? null;
  const playoffGames = activeSeason ? await getSeasonPlayoffGames(league, activeSeason) : [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={`${LEAGUE_LABEL[league]} Standings`} subtitle={activeSeason ? `${formatSeasonLabel(league, activeSeason)} season` : undefined}>
        {supportsScoreAnalytics(league) && <StandingsViewTabs league={league} active="overall" />}
      </PageHeader>
      <AdSlot label={`${LEAGUE_LABEL[league]} standings top`} />

      <SeasonTabs league={league} basePath={`/${league}/standings`} seasons={seasons} activeSeason={activeSeason} />

      <SeasonSummary league={league} playoffResults={summarizePlayoffs(playoffGames)} standings={standings} />

      <StandingsTable league={league} standings={standings} />
    </div>
  );
}
