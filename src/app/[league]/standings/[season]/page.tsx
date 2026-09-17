import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLeague, LEAGUE_LABEL, getStandingsBySeason, getStandingsSeasons, getSeasonPlayoffGames, formatSeasonLabel } from "@/lib/queries";
import { summarizePlayoffs } from "@/lib/seasonSummary";
import { pageMeta } from "@/lib/metadata";
import { AdSlot } from "@/components/AdSlot";
import { StandingsTable } from "@/components/StandingsTable";
import { SeasonTabs } from "@/components/SeasonTabs";
import { SeasonSummary } from "@/components/SeasonSummary";
import { PageHeader } from "@/components/PageHeader";

// A past season's final table never changes, so this can be cached far longer than
// the live current-season standings page.
export const revalidate = 86400;

export async function generateMetadata({ params }: { params: Promise<{ league: string; season: string }> }): Promise<Metadata> {
  const { league, season } = await params;
  if (!isLeague(league)) return {};
  const label = LEAGUE_LABEL[league];
  const seasonLabel = formatSeasonLabel(league, Number(season)) ?? season;
  return pageMeta(`${label} Standings ${seasonLabel}`, `Final ${label} table for the ${seasonLabel} season.`);
}

export default async function StandingsSeasonPage({
  params,
}: {
  params: Promise<{ league: string; season: string }>;
}) {
  const { league, season: seasonParam } = await params;
  if (!isLeague(league)) notFound();

  const season = Number(seasonParam);
  if (!Number.isInteger(season)) notFound();

  const seasons = await getStandingsSeasons(league);
  if (!seasons.includes(season)) notFound();

  const [standings, playoffGames] = await Promise.all([
    getStandingsBySeason(league, season),
    getSeasonPlayoffGames(league, season),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={`${LEAGUE_LABEL[league]} Standings`} subtitle={`${formatSeasonLabel(league, season)} season`} />
      <AdSlot label={`${LEAGUE_LABEL[league]} standings top`} />

      <SeasonTabs league={league} basePath={`/${league}/standings`} seasons={seasons} activeSeason={season} />

      <SeasonSummary league={league} playoffResults={summarizePlayoffs(playoffGames)} standings={standings} />

      <StandingsTable league={league} standings={standings} />
    </div>
  );
}
