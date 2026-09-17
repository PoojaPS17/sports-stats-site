import { notFound } from "next/navigation";
import { isLeague, LEAGUE_LABEL, getStandingsBySeason, getStandingsSeasons, getSeasonPlayoffGames, formatSeasonLabel } from "@/lib/queries";
import { summarizePlayoffs } from "@/lib/seasonSummary";
import { AdSlot } from "@/components/AdSlot";
import { StandingsTable } from "@/components/StandingsTable";
import { SeasonTabs } from "@/components/SeasonTabs";
import { SeasonSummary } from "@/components/SeasonSummary";

// A past season's final table never changes, so this can be cached far longer than
// the live current-season standings page.
export const revalidate = 86400;

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
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">{LEAGUE_LABEL[league]} Standings</h1>
        <p className="mt-0.5 text-sm text-[var(--text-muted)]">{formatSeasonLabel(league, season)} Season</p>
      </div>
      <AdSlot label={`${LEAGUE_LABEL[league]} standings top`} />

      <SeasonTabs league={league} basePath={`/${league}/standings`} seasons={seasons} activeSeason={season} />

      <SeasonSummary league={league} playoffResults={summarizePlayoffs(playoffGames)} standings={standings} />

      <StandingsTable league={league} standings={standings} />
    </div>
  );
}
