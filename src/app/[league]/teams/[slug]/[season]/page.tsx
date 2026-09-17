import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLeague, LEAGUE_LABEL, getTeamBySlug, getTeamGamesBySeason, getTeamSeasons, formatSeasonLabel } from "@/lib/queries";
import { pageMeta } from "@/lib/metadata";
import { teamNotFound } from "@/lib/legacySlug";
import { AdSlot } from "@/components/AdSlot";
import { TeamSeasonGames } from "@/components/TeamSeasonGames";
import { TeamHeader } from "@/components/TeamHeader";
import { TeamPageNav } from "@/components/TeamPageNav";
import { Breadcrumbs } from "@/components/Breadcrumbs";

// Historical seasons are static (a completed season's results never change), so these
// pages can be cached far longer than the live current-season team page.
export const revalidate = 86400;

export async function generateMetadata({ params }: { params: Promise<{ league: string; slug: string; season: string }> }): Promise<Metadata> {
  const { league, slug, season } = await params;
  if (!isLeague(league)) return {};
  const team = await getTeamBySlug(league, slug);
  if (!team) return {};
  const seasonLabel = formatSeasonLabel(league, Number(season)) ?? season;
  return pageMeta(`${team.name} ${seasonLabel} Results`, `Every ${team.name} result from the ${seasonLabel} ${LEAGUE_LABEL[league]} season.`, `/${league}/teams/${slug}/${season}`);
}

export default async function TeamSeasonPage({
  params,
}: {
  params: Promise<{ league: string; slug: string; season: string }>;
}) {
  const { league, slug, season: seasonParam } = await params;
  if (!isLeague(league)) notFound();

  const season = Number(seasonParam);
  if (!Number.isInteger(season)) notFound();

  const team = (await getTeamBySlug(league, slug)) ?? (await teamNotFound(league, slug, `/${season}`));

  const seasons = await getTeamSeasons(league, team.espn_id);
  if (!seasons.includes(season)) notFound();

  const games = await getTeamGamesBySeason(league, team.espn_id, season);

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumbs
        items={[
          { label: LEAGUE_LABEL[league], href: `/${league}` },
          { label: "Teams", href: `/${league}/teams` },
          { label: team.name, href: `/${league}/teams/${slug}` },
          { label: formatSeasonLabel(league, season) ?? String(season) },
        ]}
      />

      <TeamHeader league={league} name={team.name} logoUrl={team.logo_url} color={team.color} meta={[`${formatSeasonLabel(league, season)} season`]} />

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
