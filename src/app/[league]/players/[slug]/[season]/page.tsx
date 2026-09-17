import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";
import { isLeague, isCricketLeague, LEAGUE_LABEL, getPlayerBySlug, getPlayerLog, getPlayerSeasonStatsBySeason, getPlayerSeasons, formatSeasonLabel, type League } from "@/lib/queries";
import { pageMeta } from "@/lib/metadata";
import { playerNotFound } from "@/lib/legacySlug";
import { AdSlot } from "@/components/AdSlot";
import { PlayerHeader } from "@/components/PlayerHeader";
import { PlayerSeasonStats } from "@/components/PlayerSeasonStats";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { SectionHeader } from "@/components/SectionHeader";
import { SeasonTabs } from "@/components/SeasonTabs";
import { buildProfile, formatStat, playerMeta, playerSport } from "@/lib/playerProfile";
import { PlayerCareerStrip } from "@/components/PlayerCareerStrip";
import { PlayerSplitsTable } from "@/components/PlayerSplitsTable";
import { PlayerBestGames } from "@/components/PlayerBestGames";
import { PlayerGameLogTable } from "@/components/PlayerGameLogTable";

// A past season's stat line is static (it never changes once the season is over), so
// this can be cached far longer than the live current-season player page.
export const revalidate = 86400;

const cachedPlayer = cache((league: League, slug: string) => getPlayerBySlug(league, slug));
const cachedLog = cache((league: League, espnId: string) => getPlayerLog(league, espnId));

export async function generateMetadata({ params }: { params: Promise<{ league: string; slug: string; season: string }> }): Promise<Metadata> {
  const { league, slug, season } = await params;
  if (!isLeague(league)) return {};
  const player = await cachedPlayer(league, slug);
  if (!player) return {};
  const seasonLabel = formatSeasonLabel(league, Number(season)) ?? season;
  const sport = playerSport(league);
  let figures = "";
  if (sport) {
    const rows = (await cachedLog(league, player.espn_id)).filter((r) => r.season_year === Number(season));
    const p = buildProfile(sport, rows);
    if (p.games > 0) {
      const headline = p.profile.specs.filter((s) => s.headline).slice(0, 3);
      figures = ` ${p.games} ${p.profile.gamesLabel === "Apps" ? "appearances" : "games"}, ${headline.map((s) => `${formatStat(s, p.career[s.key])} ${s.title.toLowerCase()}`).join(", ")} for ${p.teams.map((t) => t.name).join(" and ")}.`;
    }
  }
  return pageMeta(`${player.name} ${seasonLabel} Stats`, `${player.name} ${LEAGUE_LABEL[league]} statistics for the ${seasonLabel} season.${figures} Game-by-game log, splits and best games.`, `/${league}/players/${slug}/${season}`);
}

export default async function PlayerSeasonPage({ params }: { params: Promise<{ league: string; slug: string; season: string }> }) {
  const { league, slug, season: seasonParam } = await params;
  if (!isLeague(league) || isCricketLeague(league)) notFound();

  const season = Number(seasonParam);
  if (!Number.isInteger(season)) notFound();

  const player = (await cachedPlayer(league, slug)) ?? (await playerNotFound(league, slug, (s) => `/${league}/players/${s}/${season}`));

  const sport = playerSport(league);
  const [log, feedSeasons] = await Promise.all([sport ? cachedLog(league, player.espn_id) : [], getPlayerSeasons(league, player.espn_id)]);
  const profile = sport ? buildProfile(sport, log.filter((r) => r.season_year === season)) : null;
  const seasons = [...new Set([...log.map((r) => r.season_year).filter((s): s is number => s !== null), ...feedSeasons])].sort((a, b) => b - a);
  if (!seasons.includes(season)) notFound();

  const seasonStats = await getPlayerSeasonStatsBySeason(league, player.espn_id, season);
  const basePath = `/${league}/players/${slug}`;
  const label = formatSeasonLabel(league, season) ?? String(season);

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumbs
        items={[
          { label: LEAGUE_LABEL[league], href: `/${league}` },
          ...(player.team_name && player.team_slug ? [{ label: player.team_name, href: `/${league}/teams/${player.team_slug}` }] : []),
          { label: player.name, href: basePath },
          { label },
        ]}
      />

      <PlayerHeader league={league} name={player.name} headshotUrl={player.headshot_url} teamName={player.team_name} teamSlug={player.team_slug} teamColor={player.team_color} meta={playerMeta(sport, player)} />

      <SeasonTabs league={league} basePath={basePath} seasons={seasons} activeSeason={season} />

      <AdSlot label="Player page top" />

      {profile && profile.games > 0 && (
        <>
          <section>
            <SectionHeader description={`${label} figures from every game on record.`}>{label} at a glance</SectionHeader>
            <PlayerCareerStrip league={league} profile={profile} />
          </section>

          {profile.best.length > 0 && (
            <section>
              <SectionHeader description={profile.profile.rankNote}>Best games</SectionHeader>
              <PlayerBestGames league={league} profile={profile} />
            </section>
          )}

          <div className="grid gap-6 lg:grid-cols-2">
            <section>
              <SectionHeader>Home and away</SectionHeader>
              <PlayerSplitsTable league={league} profile={profile} rows={profile.homeAway} firstColumn="Venue" />
            </section>
            {profile.byResult.length > 0 && (
              <section>
                <SectionHeader>By result</SectionHeader>
                <PlayerSplitsTable league={league} profile={profile} rows={profile.byResult} firstColumn="Team result" />
              </section>
            )}
          </div>

          <section>
            <SectionHeader>{label} game log</SectionHeader>
            <PlayerGameLogTable league={league} profile={profile} season={season} />
          </section>
        </>
      )}

      {(seasonStats || !profile || profile.games === 0) && <PlayerSeasonStats league={league} stats={seasonStats} seasons={[]} activeSeason={season} basePath={basePath} />}
    </div>
  );
}
