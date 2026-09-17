import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLeague, LEAGUE_LABEL, getPlayerBySlug, getPlayerSeasonStatsBySeason, getPlayerSeasons, formatSeasonLabel } from "@/lib/queries";
import { pageMeta } from "@/lib/metadata";
import { AdSlot } from "@/components/AdSlot";
import { PlayerHeader } from "@/components/PlayerHeader";
import { PlayerSeasonStats } from "@/components/PlayerSeasonStats";
import { Breadcrumbs } from "@/components/Breadcrumbs";

// A past season's stat line is static (it never changes once the season is over), so
// this can be cached far longer than the live current-season player page.
export const revalidate = 86400;

export async function generateMetadata({ params }: { params: Promise<{ league: string; slug: string; season: string }> }): Promise<Metadata> {
  const { league, slug, season } = await params;
  if (!isLeague(league)) return {};
  const player = await getPlayerBySlug(league, slug);
  if (!player) return {};
  const seasonLabel = formatSeasonLabel(league, Number(season)) ?? season;
  return pageMeta(`${player.name} ${seasonLabel} Stats`, `${player.name} ${LEAGUE_LABEL[league]} statistics for the ${seasonLabel} season.`);
}

export default async function PlayerSeasonPage({
  params,
}: {
  params: Promise<{ league: string; slug: string; season: string }>;
}) {
  const { league, slug, season: seasonParam } = await params;
  if (!isLeague(league)) notFound();

  const season = Number(seasonParam);
  if (!Number.isInteger(season)) notFound();

  const player = await getPlayerBySlug(league, slug);
  if (!player) notFound();

  const seasons = await getPlayerSeasons(league, player.espn_id);
  if (!seasons.includes(season)) notFound();

  const seasonStats = await getPlayerSeasonStatsBySeason(league, player.espn_id, season);

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumbs
        items={[
          { label: LEAGUE_LABEL[league], href: `/${league}` },
          ...(player.team_name && player.team_slug ? [{ label: player.team_name, href: `/${league}/teams/${player.team_slug}` }] : []),
          { label: player.name, href: `/${league}/players/${slug}` },
          { label: formatSeasonLabel(league, season) ?? String(season) },
        ]}
      />

      <PlayerHeader
        league={league}
        name={player.name}
        headshotUrl={player.headshot_url}
        teamName={player.team_name}
        teamSlug={player.team_slug}
        teamColor={player.team_color}
      />

      <AdSlot label="Player page top" />

      <PlayerSeasonStats
        league={league}
        stats={seasonStats}
        seasons={seasons}
        activeSeason={season}
        basePath={`/${league}/players/${slug}`}
      />
    </div>
  );
}
