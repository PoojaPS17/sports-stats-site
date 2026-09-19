import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLeague, hasStandings, LEAGUE_LABEL, getStandings, getStandingsBySeason, getStandingsSeasons, getMostRecentPlayedSeason, getSeasonPlayoffGames, formatSeasonLabel } from "@/lib/queries";
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
  if (!isLeague(league) || !hasStandings(league)) return {};
  const label = LEAGUE_LABEL[league];
  return pageMeta(`${label} Standings`, `Current ${label} table with wins, losses, points and streaks, plus home, away and form tables and every past season on record.`, `/${league}/standings`);
}

export default async function StandingsPage({ params }: { params: Promise<{ league: string }> }) {
  const { league } = await params;
  if (!isLeague(league) || !hasStandings(league)) notFound();

  const [latest, seasons] = await Promise.all([getStandings(league), getStandingsSeasons(league)]);
  // A table for the coming season exists (every team 0-0) before a ball is kicked;
  // showing it as "current" is meaningless, so fall back to the last season with games.
  const played = latest.some((r) => r.wins + r.losses + (r.draws ?? 0) > 0);
  const fallbackSeason = played ? null : await getMostRecentPlayedSeason(league);
  const standings = fallbackSeason ? await getStandingsBySeason(league, fallbackSeason) : latest;
  const activeSeason = standings[0]?.season ?? seasons[0] ?? null;
  const playoffGames = activeSeason ? await getSeasonPlayoffGames(league, activeSeason) : [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`${LEAGUE_LABEL[league]} Standings`}
        subtitle={activeSeason ? `${formatSeasonLabel(league, activeSeason)} season${fallbackSeason ? " (final). The new season has not started yet." : ""}` : undefined}
      >
        {supportsScoreAnalytics(league) && <StandingsViewTabs league={league} active="overall" />}
      </PageHeader>
      <AdSlot label={`${LEAGUE_LABEL[league]} standings top`} />

      <SeasonTabs league={league} basePath={`/${league}/standings`} seasons={seasons} activeSeason={activeSeason} />

      <SeasonSummary league={league} playoffResults={summarizePlayoffs(playoffGames)} standings={standings} />

      <StandingsTable league={league} standings={standings} />
    </div>
  );
}
