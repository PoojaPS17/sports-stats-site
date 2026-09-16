import { notFound } from "next/navigation";
import { isLeague, LEAGUE_LABEL, getStandings, getStandingsSeasons, formatSeasonLabel } from "@/lib/queries";
import { AdSlot } from "@/components/AdSlot";
import { StandingsTable } from "@/components/StandingsTable";
import { SeasonTabs } from "@/components/SeasonTabs";

export const revalidate = 300;

export default async function StandingsPage({ params }: { params: Promise<{ league: string }> }) {
  const { league } = await params;
  if (!isLeague(league)) notFound();

  const [standings, seasons] = await Promise.all([getStandings(league), getStandingsSeasons(league)]);
  const activeSeason = standings[0]?.season ?? seasons[0] ?? null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">{LEAGUE_LABEL[league]} Standings</h1>
        {activeSeason && <p className="mt-0.5 text-sm text-[var(--text-muted)]">{formatSeasonLabel(league, activeSeason)} Season</p>}
      </div>
      <AdSlot label={`${LEAGUE_LABEL[league]} standings top`} />

      <SeasonTabs league={league} basePath={`/${league}/standings`} seasons={seasons} activeSeason={activeSeason} />

      <StandingsTable league={league} standings={standings} />
    </div>
  );
}
