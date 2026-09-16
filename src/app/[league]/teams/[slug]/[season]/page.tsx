import { notFound } from "next/navigation";
import { isLeague, getTeamBySlug, getTeamGamesBySeason, getTeamSeasons } from "@/lib/queries";
import { AdSlot } from "@/components/AdSlot";
import { TeamSeasonGames } from "@/components/TeamSeasonGames";
import { TeamHeader } from "@/components/TeamHeader";
import { TeamPageNav } from "@/components/TeamPageNav";

// Historical seasons are static (a completed season's results never change), so these
// pages can be cached far longer than the live current-season team page.
export const revalidate = 86400;

export default async function TeamSeasonPage({
  params,
}: {
  params: Promise<{ league: string; slug: string; season: string }>;
}) {
  const { league, slug, season: seasonParam } = await params;
  if (!isLeague(league)) notFound();

  const season = Number(seasonParam);
  if (!Number.isInteger(season)) notFound();

  const team = await getTeamBySlug(league, slug);
  if (!team) notFound();

  const seasons = await getTeamSeasons(league, team.espn_id);
  if (!seasons.includes(season)) notFound();

  const games = await getTeamGamesBySeason(league, team.espn_id, season);

  return (
    <div className="flex flex-col gap-6">
      <TeamHeader league={league} name={team.name} logoUrl={team.logo_url} color={team.color} />

      <TeamPageNav basePath={`/${league}/teams/${slug}`} active="overview" />

      <AdSlot label="Team page top" />

      <TeamSeasonGames
        league={league}
        games={games}
        seasons={seasons}
        activeSeason={season}
        basePath={`/${league}/teams/${slug}`}
      />
    </div>
  );
}
