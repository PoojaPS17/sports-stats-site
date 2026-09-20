import type { Metadata } from "next";
import { teamDisplayName } from "@/lib/teamName";
import { cache } from "react";
import { notFound } from "next/navigation";
import { isLeague, isCricketLeague, LEAGUE_LABEL, getPlayerBySlug, getPlayerLog, getPlayerEspnSeasons, getPlayerReportedGames, getPlayerSeasonStatsBySeason, getPlayerSeasons, formatSeasonLabel, type League } from "@/lib/queries";
import { pageMeta } from "@/lib/metadata";
import { playerNotFound } from "@/lib/legacySlug";
import { AdSlot } from "@/components/AdSlot";
import { PlayerHeader } from "@/components/PlayerHeader";
import { ImageActions } from "@/components/ImageActions";
import { PlayerExportCard } from "@/components/PlayerExportCard";
import { careerStripStats } from "@/components/PlayerStatsShared";
import { PlayerSeasonStats } from "@/components/PlayerSeasonStats";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { SectionHeader } from "@/components/SectionHeader";
import { SeasonTabs } from "@/components/SeasonTabs";
import type { EspnSeasonTotals } from "@/lib/espnSeason";
import { buildStagedProfile, formatStat, metaFigures, noBoxScoreGames, playerMeta, playerSport, reportedForSeason, unlistedGameCount, type StagedProfile } from "@/lib/playerProfile";
import { PlayerCareerStrip } from "@/components/PlayerCareerStrip";
import { PlayerSeasonTable } from "@/components/PlayerSeasonTable";
import { PlayerSplitsTable } from "@/components/PlayerSplitsTable";
import { PlayerBestGames } from "@/components/PlayerBestGames";
import { PlayerGameLogTable } from "@/components/PlayerGameLogTable";
import { RelatedLinks } from "@/components/RelatedLinks";
import { supportsMatchweeks, weekIndexPath, weekNoun } from "@/lib/matchweeks";
import { BOX_ROWS_ONLY_NOTE, gamesAndFigures, NFL_PLAYOFFS_NOTE, nflRegularSeasonNote, seasonFiguresText, unlistedGamesNote, withBoxRowsNote, withNoBoxScoreNote } from "@/lib/playerCopy";

// A past season's stat line is static (it never changes once the season is over), so
// this can be cached far longer than the live current-season player page.
export const revalidate = 86400;

const cachedPlayer = cache((league: League, slug: string) => getPlayerBySlug(league, slug));
const cachedLog = cache((league: League, espnId: string) => getPlayerLog(league, espnId));
const cachedReportedGames = cache((league: League, espnId: string) => getPlayerReportedGames(league, espnId));
const cachedEspnSeasons = cache((league: League, espnId: string) => getPlayerEspnSeasons(league, espnId));

// Any appearance that season: a player with only playoff or play-in games still has a page to show.
function hasGames(staged: StagedProfile): boolean {
  return staged.log.length > 0 || staged.counted.games > 0;
}

export async function generateMetadata({ params }: { params: Promise<{ league: string; slug: string; season: string }> }): Promise<Metadata> {
  const { league, slug, season } = await params;
  if (!isLeague(league)) return {};
  const player = await cachedPlayer(league, slug);
  if (!player) return {};
  const seasonLabel = formatSeasonLabel(league, Number(season)) ?? season;
  const sport = playerSport(league);
  let figures = "";
  let empty = false;
  if (sport) {
    const [log, reportedGames, espnSeasons] = await Promise.all([cachedLog(league, player.espn_id), cachedReportedGames(league, player.espn_id), cachedEspnSeasons(league, player.espn_id)]);
    const staged = buildStagedProfile(sport, log.filter((r) => r.season_year === Number(season)), reportedForSeason(reportedGames, Number(season)), espnSeasons);
    const p = staged.regular;
    if (p.games > 0) {
      const headline = p.profile.specs.filter((s) => s.headline).slice(0, 3);
      // Averages are quoted only where they cover the games named beside them: an NBA season still short of ESPN's games
      // on its box rows (or made only of games with no box score) gives the games and clubs alone.
      const quoted = metaFigures(p, headline.map((s) => `${formatStat(s, p.career[s.key])} ${s.title.toLowerCase()}`).join(", "));
      figures = ` ${gamesAndFigures(`${p.games} ${p.profile.gamesLabel === "Apps" ? "appearances" : "games"}`, quoted)} for ${p.teams.map((t) => t.name).join(" and ")}.`;
    } else {
      // Named in a squad but never used that season: nothing here worth indexing. (A season of
      // playoff or play-in games only still has a page to show.)
      empty = !hasGames(staged) && !(await getPlayerSeasonStatsBySeason(league, player.espn_id, Number(season)));
    }
  }
  return pageMeta(`${player.name} ${seasonLabel} ${LEAGUE_LABEL[league]} Stats`, `${player.name} ${LEAGUE_LABEL[league]} statistics for the ${seasonLabel} season.${figures} Game-by-game log, splits and best games.`, `/${league}/players/${slug}/${season}`, { noindex: empty });
}

export default async function PlayerSeasonPage({ params }: { params: Promise<{ league: string; slug: string; season: string }> }) {
  const { league, slug, season: seasonParam } = await params;
  if (!isLeague(league) || isCricketLeague(league)) notFound();

  const season = Number(seasonParam);
  if (!Number.isInteger(season)) notFound();

  const player = (await cachedPlayer(league, slug)) ?? (await playerNotFound(league, slug, (s) => `/${league}/players/${s}/${season}`));

  const sport = playerSport(league);
  const [log, reportedGames, espnSeasons, feedSeasons] = await Promise.all([
    sport ? cachedLog(league, player.espn_id) : [],
    sport ? cachedReportedGames(league, player.espn_id) : new Map<number, number>(),
    sport ? cachedEspnSeasons(league, player.espn_id) : new Map<number, EspnSeasonTotals>(),
    getPlayerSeasons(league, player.espn_id),
  ]);
  const staged = sport ? buildStagedProfile(sport, log.filter((r) => r.season_year === season), reportedForSeason(reportedGames, season), espnSeasons) : null;
  // Regular season (for soccer, every appearance) drives the strip and the splits; best games read
  // every counted game.
  const profile = staged?.regular ?? null;
  const anyGames = staged ? hasGames(staged) : false;
  const seasons = [...new Set([...log.map((r) => r.season_year).filter((s): s is number => s !== null), ...feedSeasons])].sort((a, b) => b - a);
  if (!seasons.includes(season)) notFound();

  const seasonStats = await getPlayerSeasonStatsBySeason(league, player.espn_id, season);
  const basePath = `/${league}/players/${slug}`;
  const label = formatSeasonLabel(league, season) ?? String(season);
  // NBA games without a box score: in GP, in no game-by-game section. The section notes and the log line say so.
  const regularNoBoxScore = staged && profile ? noBoxScoreGames(staged.regular.sport, profile.games, profile.recorded) : 0;
  const playoffsNoBoxScore = staged?.playoffs ? noBoxScoreGames(staged.playoffs.sport, staged.playoffs.games, staged.playoffs.recorded) : 0;
  const playinNoBoxScore = staged?.playin ? noBoxScoreGames(staged.playin.sport, staged.playin.games, staged.playin.recorded) : 0;
  const countedNoBoxScore = staged ? unlistedGameCount(staged) : 0;
  const unlisted = countedNoBoxScore > 0 ? unlistedGamesNote(countedNoBoxScore) : null;
  // The sections built from game rows say so: the splits by the regular season's games without a box score, best
  // games (which reads every counted game) by all of them.
  const regularRowsNote = regularNoBoxScore > 0 ? BOX_ROWS_ONLY_NOTE : undefined;

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumbs
        items={[
          { label: LEAGUE_LABEL[league], href: `/${league}` },
          ...(player.team_name && player.team_slug ? [{ label: teamDisplayName(player.team_name), href: `/${league}/teams/${player.team_slug}` }] : []),
          { label: player.name, href: basePath },
          { label },
        ]}
      />

      <PlayerHeader league={league} slug={slug} name={player.name} headshotUrl={player.headshot_url} teamName={player.team_name} teamSlug={player.team_slug} teamColor={player.team_color} meta={playerMeta(sport, player)} photoCredit={player.photo_credit ? { credit: player.photo_credit, license: player.photo_license ?? "see source", sourceUrl: player.photo_source_url ?? "https://commons.wikimedia.org" } : null} />

      <SeasonTabs league={league} basePath={basePath} seasons={seasons} activeSeason={season} />

      <AdSlot label="Player page top" />

      {staged && profile && anyGames && (
        <>
          {profile.games > 0 && (
            <section>
              <SectionHeader
                description={sport === "nfl" ? nflRegularSeasonNote(staged.regular.gamesFromEspn) : withNoBoxScoreNote(seasonFiguresText(label, staged.split, regularNoBoxScore), regularNoBoxScore, "season")}
                tools={
                  <ImageActions
                    filename={`${slug}-${season}-${league}`}
                    shareTitle={`${player.name} ${label} stats`}
                    card={<PlayerExportCard league={league} name={player.name} headshotUrl={player.headshot_url} teamName={player.team_name} teamColor={player.team_color} meta={playerMeta(sport, player)} stats={careerStripStats(profile)} boxOnlyShort={profile.boxOnlyShort} context={`${label} stats`} />}
                  />
                }
              >
                {staged.split ? `${label} regular season` : `${label} in numbers`}
              </SectionHeader>
              <PlayerCareerStrip league={league} profile={profile} />
            </section>
          )}

          {profile.games === 0 && (staged.playoffs || staged.playin) && (
            <section>
              <SectionHeader>{label} regular season</SectionHeader>
              <p className="card px-4 py-6 text-sm text-[var(--text-muted)]">No games on record for {player.name} in {LEAGUE_LABEL[league]} yet.</p>
            </section>
          )}

          {staged.playoffs && (
            <section>
              <SectionHeader description={sport === "nfl" ? NFL_PLAYOFFS_NOTE : withNoBoxScoreNote("Playoff games only; ESPN lists these separately from the regular season.", playoffsNoBoxScore, "other")}>Playoffs</SectionHeader>
              <PlayerSeasonTable league={league} profile={staged.playoffs} basePath={basePath} activeSeason={season} careerLabel="Career playoffs" baseSeason={null} />
            </section>
          )}

          {staged.playin && (
            <section>
              <SectionHeader description={withNoBoxScoreNote("Play-in tournament games, listed separately from the regular season and the playoffs.", playinNoBoxScore, "other")}>Play-In</SectionHeader>
              <PlayerSeasonTable league={league} profile={staged.playin} basePath={basePath} activeSeason={season} careerLabel="Career play-in" baseSeason={null} />
            </section>
          )}

          {staged.counted.best.length > 0 && (
            <section>
              <SectionHeader description={withBoxRowsNote(staged.counted.profile.rankNote, countedNoBoxScore)}>Best games</SectionHeader>
              <PlayerBestGames league={league} profile={staged.counted} />
            </section>
          )}

          {/* The splits read the games with a stat line: a season made only of games with no box score has none. */}
          {profile.rows.length > 0 && (
            <div className="grid gap-6 lg:grid-cols-2">
              <section>
                <SectionHeader description={regularRowsNote}>Home and away</SectionHeader>
                <PlayerSplitsTable league={league} profile={profile} rows={profile.homeAway} firstColumn="Venue" />
              </section>
              {profile.byResult.length > 0 && (
                <section>
                  <SectionHeader description={regularRowsNote}>By result</SectionHeader>
                  <PlayerSplitsTable league={league} profile={profile} rows={profile.byResult} firstColumn="Team result" />
                </section>
              )}
            </div>
          )}

          <section>
            <SectionHeader description={staged.log.length > 0 && unlisted ? unlisted : undefined}>{label} game log</SectionHeader>
            {staged.log.length === 0 && unlisted ? (
              <p className="card px-4 py-6 text-sm text-[var(--text-muted)]">{unlisted}</p>
            ) : (
              <PlayerGameLogTable league={league} profile={profile} rows={staged.log} split={staged.split} season={season} />
            )}
          </section>
        </>
      )}

      <RelatedLinks
        groups={[
          {
            title: `${label} season`,
            links: [
              ...(staged?.counted.teams ?? []).map((t) => ({ href: `/${league}/teams/${t.slug}/${season}`, label: `${t.name} ${label}`, sub: "Every result that season", image: t.logo, imageName: t.name })),
              { href: `/${league}/standings/${season}`, label: `${label} standings` },
              ...(supportsMatchweeks(league) ? [{ href: weekIndexPath(league, season), label: `Every ${weekNoun(league).toLowerCase()} of ${label}` }] : []),
            ],
          },
          { title: player.name, links: [{ href: basePath, label: `${player.name} career`, sub: "Every season on record, splits, best games and milestones", image: player.headshot_url, imageName: player.name }] },
        ]}
      />

      {(seasonStats || !staged || !profile || (profile.games === 0 && !staged.playoffs && !staged.playin)) && <PlayerSeasonStats league={league} stats={seasonStats} seasons={[]} activeSeason={season} basePath={basePath} />}
    </div>
  );
}
