import type { Metadata } from "next";
import { teamDisplayName } from "@/lib/teamName";
import { cache } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  isLeague,
  isCricketLeague,
  LEAGUE_LABEL,
  getPlayerBySlug,
  getPlayerLog,
  getPlayerReportedGames,
  getPlayerEspnSeasons,
  getPlayerGoalClocks,
  getPlayerSeasonStatsBySeason,
  getPlayerSeasons,
  getPlayerCricketCareer,
  getPlayerCricketSplits,
  CRICKET_SPLIT_DIMENSIONS,
  type CricketSplitDimension,
  type CricketSplitRow,
  type League,
  type PlayerRow,
} from "@/lib/queries";
import { pageMeta } from "@/lib/metadata";
import { formatGameDate } from "@/lib/gameDay";
import { playerNotFound } from "@/lib/legacySlug";
import { AdSlot } from "@/components/AdSlot";
import { SectionHeader } from "@/components/SectionHeader";
import { PlayerHeader } from "@/components/PlayerHeader";
import { PlayerSeasonStats } from "@/components/PlayerSeasonStats";
import { CricketCareer } from "@/components/CricketCareer";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { JsonLd } from "@/components/JsonLd";
import { athleteSchema } from "@/lib/structuredData";
import { buildStagedProfile, goalBands, hasGames, noBoxScoreGames, playerMeta, playerSport, positionLabel, storedGamesOnly, unlistedGameCount, type StagedProfile } from "@/lib/playerProfile";
import { profileSummary } from "@/lib/playerDescriptions";
import { PlayerCareerStrip } from "@/components/PlayerCareerStrip";
import { ImageActions } from "@/components/ImageActions";
import { PlayerExportCard } from "@/components/PlayerExportCard";
import { careerStripStats } from "@/components/PlayerStatsShared";
import { PlayerSeasonTable } from "@/components/PlayerSeasonTable";
import { PlayerSplitsTable } from "@/components/PlayerSplitsTable";
import { PlayerBestGames } from "@/components/PlayerBestGames";
import { PlayerMilestones } from "@/components/PlayerMilestones";
import { PlayerFormChart } from "@/components/PlayerFormChart";
import { PlayerGameLogTable } from "@/components/PlayerGameLogTable";
import { GoalMinutesChart } from "@/components/GoalMinutesChart";
import { RelatedLinks } from "@/components/RelatedLinks";
import { getTeammates, getPositionPeers } from "@/lib/related";
import { h2hPath } from "@/lib/h2h";
import { BOX_ROWS_ONLY_NOTE, NBA_NO_BOX_SCORE_NOTE, NBA_REGULAR_SEASON_FOOTNOTE, NFL_NO_GAME_LOG_NOTE, NFL_PLAYOFFS_NOTE, nflRegularSeasonNote, unlistedGamesNote, withBoxRowsNote, withMilestonesNote, withNoBoxScoreNote } from "@/lib/playerCopy";

export const revalidate = 300;

// An empty list, so nothing is built up front: each address is rendered on the first request and
// then served from the cache above until it goes stale. Without this export the page would be
// rendered again on every request and the revalidate above would never apply. Addresses that do
// not exist still render on demand and 404 (dynamicParams is left at its default).
export function generateStaticParams() {
  return [];
}

// generateMetadata and the page both need the player and the log; React's request
// cache means each is fetched once per request.
const cachedPlayer = cache((league: League, slug: string) => getPlayerBySlug(league, slug));
const cachedLog = cache((league: League, espnId: string) => getPlayerLog(league, espnId));
const cachedReportedGames = cache((league: League, espnId: string) => getPlayerReportedGames(league, espnId));
const cachedEspnSeasons = cache((league: League, espnId: string) => getPlayerEspnSeasons(league, espnId));

async function loadStaged(league: League, player: PlayerRow): Promise<StagedProfile | null> {
  const sport = playerSport(league);
  if (!sport) return null;
  const [log, reportedGames, espnSeasons] = await Promise.all([cachedLog(league, player.espn_id), cachedReportedGames(league, player.espn_id), cachedEspnSeasons(league, player.espn_id)]);
  return buildStagedProfile(sport, log, reportedGames, espnSeasons);
}

export async function generateMetadata({ params }: { params: Promise<{ league: string; slug: string }> }): Promise<Metadata> {
  const { league, slug } = await params;
  if (!isLeague(league)) return {};
  const player = await cachedPlayer(league, slug);
  if (!player) return {};
  if (isCricketLeague(league)) {
    const team = player.team_name ? ` (${player.team_name})` : "";
    return pageMeta(`${player.name} ${LEAGUE_LABEL[league]} Stats & Game Log`, `${player.name}${team} ${LEAGUE_LABEL[league]} career figures, match-by-match record and splits.`, `/${league}/players/${slug}`);
  }
  const staged = await loadStaged(league, player);
  const profile = staged?.regular ?? null;
  const seasons = hasGames(staged) ? [] : await getPlayerSeasons(league, player.espn_id);
  const empty = !hasGames(staged) && seasons.length === 0;
  // The competition is named because a player has a page in each one he plays in.
  const longTitle = `${player.name} ${LEAGUE_LABEL[league]} Stats, Game Log & Career`;
  return pageMeta(longTitle.length <= 60 ? longTitle : `${player.name} ${LEAGUE_LABEL[league]} Stats & Game Log`, profileSummary(league, player.name, profile, true), `/${league}/players/${slug}`, { noindex: empty });
}

export default async function PlayerPage({
  params,
}: {
  params: Promise<{ league: string; slug: string }>;
}) {
  const { league, slug } = await params;
  if (!isLeague(league)) notFound();

  const player = (await cachedPlayer(league, slug)) ?? (await playerNotFound(league, slug, (s) => `/${league}/players/${s}`));

  const basePath = `/${league}/players/${slug}`;
  const sport = playerSport(league);

  // A player who has moved on keeps their last club on record, but not as "their team".
  const onRoster = player.on_roster !== false;
  const headerTeam = onRoster ? player.team_name : null;
  const headerTeamSlug = onRoster ? player.team_slug : null;
  const lastClub = !onRoster && player.team_name ? [`Last on record with ${teamDisplayName(player.team_name)}`] : [];

  const header = (meta: string[], description?: string) => (
    <>
      <Breadcrumbs
        items={[
          { label: LEAGUE_LABEL[league], href: `/${league}` },
          ...(headerTeam && headerTeamSlug ? [{ label: headerTeam, href: `/${league}/teams/${headerTeamSlug}` }] : []),
          { label: player.name },
        ]}
      />
      <JsonLd data={athleteSchema(league, player, { position: positionLabel(sport, player.position), description })} />
      <PlayerHeader
        league={league}
        slug={slug}
        name={player.name}
        headshotUrl={player.headshot_url}
        teamName={headerTeam}
        teamSlug={headerTeamSlug}
        teamColor={player.team_color}
        meta={[...meta, ...lastClub]}
        photoCredit={player.photo_credit ? { credit: player.photo_credit, license: player.photo_license ?? "see source", sourceUrl: player.photo_source_url ?? "https://commons.wikimedia.org" } : null}
      />
      <Link href={`/${league}/compare/players?a=${slug}`} className="-mt-3 text-sm font-semibold text-[var(--accent)] hover:underline">
        Compare {player.name} with another player →
      </Link>
      <AdSlot label="Player page top" />
    </>
  );

  if (isCricketLeague(league) || !sport) {
    // Every split at once: they are tabs in the page now, so the player has one address and the
    // page renders the same for everyone (which is what lets it be cached).
    const [career, splitRows] = await Promise.all([
      getPlayerCricketCareer(league, player.espn_id),
      Promise.all(CRICKET_SPLIT_DIMENSIONS.map((d) => getPlayerCricketSplits(league, player.espn_id, d.key))),
    ]);
    const splits = Object.fromEntries(CRICKET_SPLIT_DIMENSIONS.map((d, i) => [d.key, splitRows[i]])) as Record<CricketSplitDimension, CricketSplitRow[]>;
    return (
      <div className="flex flex-col gap-6">
        {header(playerMeta(null, player))}
        {career ? (
          <CricketCareer league={league} career={career} splits={splits} />
        ) : (
          <p className="card px-4 py-6 text-sm text-[var(--text-muted)]">No matches on record yet.</p>
        )}
      </div>
    );
  }

  const [staged, feedSeasons] = await Promise.all([loadStaged(league, player), getPlayerSeasons(league, player.espn_id)]);
  if (!staged) notFound();
  // Regular season (for soccer, every appearance) drives the career strip, the season table, the
  // splits and the summary; best games and recent form read every counted game.
  const profile = staged.regular;
  const anyGames = hasGames(staged);
  // No box-score row in the regular season (ESPN lists games for the player and no stat line): games only, no stats, clubs or log.
  const storedOnly = storedGamesOnly(profile);
  const split = staged.split;
  const latestRegular = profile.seasons[0]?.season ?? null;
  const seasons = [...new Set([...staged.counted.seasons.map((s) => s.season), ...feedSeasons])].sort((a, b) => b - a);
  const latest = seasons[0] ?? null;
  const [feedStats, goals] = await Promise.all([
    latest ? getPlayerSeasonStatsBySeason(league, player.espn_id, latest) : null,
    sport === "soccer" && anyGames && !profile.profile.specs.some((s) => s.key === "cs")
      ? getPlayerGoalClocks(league, player.espn_id, profile.rows.map((r) => r.game_espn_id))
      : null,
  ]);
  const summary = profileSummary(league, player.name, profile);
  const soccer = sport === "soccer";
  // NBA games without a box score: in GP, in no game-by-game section. The section notes and the log line say so.
  const regularNoBoxScore = noBoxScoreGames(sport, profile.games, profile.recorded);
  const playoffsNoBoxScore = staged.playoffs ? noBoxScoreGames(sport, staged.playoffs.games, staged.playoffs.recorded) : 0;
  const playinNoBoxScore = staged.playin ? noBoxScoreGames(sport, staged.playin.games, staged.playin.recorded) : 0;
  // Games without a box score across the regular season, playoffs and play-in (what best games and recent form read), not to be
  // confused with `regularNoBoxScore`, the regular season's alone.
  const countedNoBoxScore = unlistedGameCount(staged);
  const unlisted = countedNoBoxScore > 0 ? unlistedGamesNote(countedNoBoxScore) : null;
  // The sections built from game rows say so: the regular-season ones by the regular season's games without a box score,
  // the ones that read every counted game (best games, recent form) by all of them.
  const regularRowsNote = regularNoBoxScore > 0 ? BOX_ROWS_ONLY_NOTE : undefined;
  const countedRowsNote = countedNoBoxScore > 0 ? BOX_ROWS_ONLY_NOTE : undefined;
  // Where the game log would be: the games with no box score, or (a player with no game rows at all) that there is none.
  const logNote = staged.log.length === 0 ? (unlisted ?? (storedOnly ? NFL_NO_GAME_LOG_NOTE : null)) : null;
  const bands = goals ? goalBands(goals.clocks) : [];
  const since = profile.firstDate ? formatGameDate(profile.firstDate, league, { month: "short", year: "numeric" }) : null;

  // The link mesh: squad-mates, the league's best at this position, and the
  // head-to-head pages behind the opponents this player has faced most.
  const [teammates, peers] = await Promise.all([
    player.team_espn_id && onRoster ? getTeammates(league, player.team_espn_id, player.espn_id) : [],
    getPositionPeers(league, player.position, player.espn_id),
  ]);
  const teamSlug = player.team_slug ?? staged.counted.teams[0]?.slug ?? null;
  const teamName = player.team_name ?? staged.counted.teams[0]?.name ?? null;
  const rivals =
    teamSlug && teamName
      ? profile.opponents
          .filter((o) => o.slug !== teamSlug)
          .slice(0, 6)
          .map((o) => ({ href: h2hPath(league, teamSlug, o.slug), label: `${teamName} vs ${o.label}`, sub: `${o.games} ${o.games === 1 ? "game" : "games"} played in${regularNoBoxScore > 0 ? " with a box score" : ""}`, image: o.logo, imageName: o.label }))
      : [];
  const compareLinks = peers.slice(0, 3).map((p) => ({ href: `/${league}/compare/players?a=${slug}&b=${p.href.split("/").pop()}`, label: `${player.name} vs ${p.label}`, sub: "Season stats side by side" }));

  return (
    <div className="flex flex-col gap-6">
      {header(playerMeta(sport, player), summary)}

      {!anyGames ? (
        <>
          <p className="card px-4 py-6 text-sm text-[var(--text-muted)]">No games on record for {player.name} in {LEAGUE_LABEL[league]} yet.</p>
          <PlayerSeasonStats league={league} stats={feedStats} seasons={seasons} activeSeason={latest} basePath={basePath} />
        </>
      ) : (
        <>
          {profile.games > 0 ? (
            <>
              <section>
                <SectionHeader
                  description={regularNoBoxScore > 0 ? NBA_NO_BOX_SCORE_NOTE : undefined}
                  tools={
                    <ImageActions
                      filename={`${slug}-${league}`}
                      shareTitle={split ? `${player.name} career stats (regular season)` : `${player.name} career stats`}
                      card={<PlayerExportCard league={league} name={player.name} headshotUrl={player.headshot_url} teamName={headerTeam} teamColor={player.team_color} meta={[...playerMeta(sport, player), ...lastClub]} stats={careerStripStats(profile)} boxOnlyShort={profile.boxOnlyShort} />}
                    />
                  }
                >
                  {split ? "Career (regular season)" : "Career"}
                </SectionHeader>
                <PlayerCareerStrip league={league} profile={profile} />
              </section>

              <section>
                <SectionHeader description={profile.sport === "nba" ? withNoBoxScoreNote("Per-game averages; shooting as made over attempted for the season.", regularNoBoxScore, "table") : profile.sport === "nfl" ? nflRegularSeasonNote(profile.gamesFromEspn, storedOnly) : "Totals from the box score of every game on record."}>{split ? "Regular season" : "Season by season"}</SectionHeader>
                <PlayerSeasonTable league={league} profile={profile} basePath={basePath} />
              </section>
            </>
          ) : (
            <section>
              <SectionHeader>Regular season</SectionHeader>
              <p className="card px-4 py-6 text-sm text-[var(--text-muted)]">No games on record for {player.name} in {LEAGUE_LABEL[league]} yet.</p>
            </section>
          )}

          {staged.playoffs && (
            <section>
              <SectionHeader description={sport === "nfl" ? NFL_PLAYOFFS_NOTE : withNoBoxScoreNote("Playoff games only; ESPN lists these separately from the regular season.", playoffsNoBoxScore, "other")}>Playoffs</SectionHeader>
              <PlayerSeasonTable league={league} profile={staged.playoffs} basePath={basePath} careerLabel="Career playoffs" baseSeason={latestRegular} />
            </section>
          )}

          {staged.playin && (
            <section>
              <SectionHeader description={withNoBoxScoreNote("Play-in tournament games, listed separately from the regular season and the playoffs.", playinNoBoxScore, "other")}>Play-In</SectionHeader>
              <PlayerSeasonTable league={league} profile={staged.playin} basePath={basePath} careerLabel="Career play-in" baseSeason={latestRegular} />
            </section>
          )}

          {staged.counted.form.length > 1 && (
            <section>
              <SectionHeader description={countedRowsNote}>Recent form</SectionHeader>
              <PlayerFormChart league={league} profile={staged.counted} />
            </section>
          )}

          {staged.counted.best.length > 0 && (
            <section>
              <SectionHeader description={withBoxRowsNote(staged.counted.profile.rankNote, countedNoBoxScore)}>Best games</SectionHeader>
              <PlayerBestGames league={league} profile={staged.counted} />
            </section>
          )}

          {profile.games > 0 && (
            <>
              {/* The splits read the games with a stat line: a regular season made only of games with no box score has none. */}
              {profile.rows.length > 0 && (
                <>
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

                  {goals && goals.clocks.length > 0 && (
                    <section>
                      <SectionHeader>Goals by minute</SectionHeader>
                      <GoalMinutesChart bands={bands} reports={goals.reports} games={profile.games} />
                    </section>
                  )}

                  <section>
                    <SectionHeader description={withBoxRowsNote("Opponents faced, most often first.", regularNoBoxScore)}>Against each opponent</SectionHeader>
                    <PlayerSplitsTable league={league} profile={profile} rows={profile.opponents} firstColumn="Opponent" linkTeams />
                  </section>
                </>
              )}

              {profile.milestones.length > 0 && (
                <section>
                  <SectionHeader description={withMilestonesNote("Landmarks within the games on record, pinned to the game they came in.", regularNoBoxScore)}>Milestones</SectionHeader>
                  <PlayerMilestones league={league} profile={profile} />
                </section>
              )}
            </>
          )}

          <AdSlot label="Player page middle" />

          <section>
            <SectionHeader description={`Every ${LEAGUE_LABEL[league]} game on record, latest season open.${unlisted && staged.log.length > 0 ? ` ${unlisted}` : ""}`}>Game log</SectionHeader>
            {logNote ? (
              <p className="card px-4 py-6 text-sm text-[var(--text-muted)]">{logNote}</p>
            ) : (
              <PlayerGameLogTable league={league} profile={profile} rows={staged.log} split={split} />
            )}
          </section>

          {feedStats && <PlayerSeasonStats league={league} stats={feedStats} seasons={seasons} activeSeason={latest} basePath={basePath} />}

          <RelatedLinks
            groups={[
              { title: headerTeam ? `${headerTeam} squad` : "Teammates", links: teammates },
              { title: `${LEAGUE_LABEL[league]} ${positionLabel(sport, player.position)?.toLowerCase() ?? "position"} leaders`, links: peers },
              { title: "Head-to-head", links: rivals },
              { title: "Compare", links: compareLinks },
            ]}
          />

          {split ? (
            <p className="text-[11px] text-[var(--text-faint)]">
              {profile.games > 0 && regularNoBoxScore === 0 && !storedOnly && (
                <>
                  Regular-season figures are summed from the {sport === "nfl" ? profile.rows.length : profile.games} {LEAGUE_LABEL[league]} regular-season games {sport === "nfl" ? "with a recorded stat line" : "on record"} here
                  {since ? ` since ${since}` : ""}.{" "}
                </>
              )}
              {regularNoBoxScore > 0 && <>{NBA_REGULAR_SEASON_FOOTNOTE} </>}
              {sport === "nfl"
                ? "Playoff games are shown separately; preseason and Pro Bowl games are listed in the game log but not counted, matching ESPN."
                : "Playoff and play-in games are shown separately; preseason, All-Star and NBA Cup final games are listed in the game log but not counted, matching ESPN."}
            </p>
          ) : (
            <p className="text-[11px] text-[var(--text-faint)]">
              Career figures are summed from the {profile.games} {LEAGUE_LABEL[league]} {soccer ? "appearances" : "games"} on record here
              {since ? ` since ${since}` : ""}; earlier games and other competitions are not included.
            </p>
          )}
        </>
      )}
    </div>
  );
}
