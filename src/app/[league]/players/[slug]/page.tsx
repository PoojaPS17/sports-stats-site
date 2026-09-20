import type { Metadata } from "next";
import { teamDisplayName } from "@/lib/teamName";
import { cache } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  isLeague,
  isCricketLeague,
  LEAGUE_LABEL,
  formatSeasonLabel,
  getPlayerBySlug,
  getPlayerLog,
  getPlayerReportedGames,
  getPlayerGoalClocks,
  getPlayerSeasonStatsBySeason,
  getPlayerSeasons,
  getPlayerCricketCareer,
  getPlayerCricketSplits,
  CRICKET_SPLIT_DIMENSIONS,
  type CricketSplitDimension,
  type League,
  type PlayerRow,
} from "@/lib/queries";
import { pageMeta } from "@/lib/metadata";
import { playerNotFound } from "@/lib/legacySlug";
import { AdSlot } from "@/components/AdSlot";
import { SectionHeader } from "@/components/SectionHeader";
import { PlayerHeader } from "@/components/PlayerHeader";
import { PlayerSeasonStats } from "@/components/PlayerSeasonStats";
import { CricketCareer } from "@/components/CricketCareer";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { JsonLd } from "@/components/JsonLd";
import { athleteSchema } from "@/lib/structuredData";
import { buildStagedProfile, goalBands, formatStat, playerMeta, playerSport, positionLabel, type PlayerProfile, type StagedProfile } from "@/lib/playerProfile";
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
import { NFL_PLAYOFFS_NOTE, nflRegularSeasonNote } from "@/lib/playerCopy";

export const revalidate = 300;

// "Cody Gakpo Premier League stats: 89 apps, 21 goals, 12 assists for Liverpool since
// 2022-23." — the figures are the description, so the snippet answers the search.
// The page shows the long form; the meta description gets the short one, since search
// results cut a description off at about 155 characters.
function profileSummary(league: League, player: PlayerRow, profile: PlayerProfile | null, short = false): string {
  if (!profile || profile.games === 0) return `${player.name} ${LEAGUE_LABEL[league]} stats, season by season, with a game-by-game log.`;
  const headline = profile.profile.specs.filter((s) => s.headline).slice(0, 3);
  const perGame = profile.sport === "nba" && headline.every((s) => s.agg === "avg");
  const figures = headline.map((s) => `${formatStat(s, profile.career[s.key])} ${s.title.toLowerCase()}${!perGame && profile.sport === "nba" && s.agg === "avg" ? " per game" : ""}`);
  const teams = profile.teams.map((t) => t.name);
  const since = profile.seasons[profile.seasons.length - 1]?.season;
  const games = `${profile.games} ${profile.profile.gamesLabel === "Apps" ? "appearances" : "games"}`;
  const lead = `${player.name} ${LEAGUE_LABEL[league]} stats: ${games}, ${figures.join(", ")}${perGame ? " per game" : ""} for ${teams.join(" and ")}${since ? ` since ${formatSeasonLabel(league, since)}` : ""}.`;
  if (!short) return `${lead} Season-by-season totals, full game log, home and away and opponent splits, best games and milestones.`;
  const tail = " Game log, splits and best games.";
  return lead.length + tail.length <= 160 ? lead + tail : lead;
}

// generateMetadata and the page both need the player and the log; React's request
// cache means each is fetched once per request.
const cachedPlayer = cache((league: League, slug: string) => getPlayerBySlug(league, slug));
const cachedLog = cache((league: League, espnId: string) => getPlayerLog(league, espnId));
const cachedReportedGames = cache((league: League, espnId: string) => getPlayerReportedGames(league, espnId));

async function loadStaged(league: League, player: PlayerRow): Promise<StagedProfile | null> {
  const sport = playerSport(league);
  if (!sport) return null;
  const [log, reportedGames] = await Promise.all([cachedLog(league, player.espn_id), cachedReportedGames(league, player.espn_id)]);
  return buildStagedProfile(sport, log, reportedGames);
}

// Any appearance at all: a player with only playoff or play-in games still has a page to show.
function hasGames(staged: StagedProfile | null): boolean {
  return staged !== null && (staged.log.length > 0 || staged.counted.games > 0);
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
  return pageMeta(longTitle.length <= 60 ? longTitle : `${player.name} ${LEAGUE_LABEL[league]} Stats & Game Log`, profileSummary(league, player, profile, true), `/${league}/players/${slug}`, { noindex: empty });
}

function isSplitDimension(value: string | undefined): value is CricketSplitDimension {
  return CRICKET_SPLIT_DIMENSIONS.some((d) => d.key === value);
}

export default async function PlayerPage({
  params,
  searchParams,
}: {
  params: Promise<{ league: string; slug: string }>;
  searchParams: Promise<{ split?: string }>;
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
    const { split: splitParam } = await searchParams;
    const activeSplit: CricketSplitDimension = isSplitDimension(splitParam) ? splitParam : "team";
    const [career, splits] = await Promise.all([getPlayerCricketCareer(league, player.espn_id), getPlayerCricketSplits(league, player.espn_id, activeSplit)]);
    return (
      <div className="flex flex-col gap-6">
        {header(playerMeta(null, player))}
        {career ? (
          <CricketCareer league={league} career={career} splits={splits} activeSplit={activeSplit} basePath={basePath} />
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
  const summary = profileSummary(league, player, profile);
  const soccer = sport === "soccer";
  const bands = goals ? goalBands(goals.clocks) : [];
  const since = profile.firstDate ? new Date(profile.firstDate).toLocaleDateString("en-US", { month: "short", year: "numeric" }) : null;

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
          .map((o) => ({ href: h2hPath(league, teamSlug, o.slug), label: `${teamName} vs ${o.label}`, sub: `${o.games} ${o.games === 1 ? "game" : "games"} played in`, image: o.logo, imageName: o.label }))
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
                  tools={
                    <ImageActions
                      filename={`${slug}-${league}`}
                      shareTitle={split ? `${player.name} career stats (regular season)` : `${player.name} career stats`}
                      card={<PlayerExportCard league={league} name={player.name} headshotUrl={player.headshot_url} teamName={headerTeam} teamColor={player.team_color} meta={[...playerMeta(sport, player), ...lastClub]} stats={careerStripStats(profile)} />}
                    />
                  }
                >
                  {split ? "Career (regular season)" : "Career"}
                </SectionHeader>
                <PlayerCareerStrip league={league} profile={profile} />
              </section>

              <section>
                <SectionHeader description={profile.sport === "nba" ? "Per-game averages; shooting as made over attempted for the season." : profile.sport === "nfl" ? nflRegularSeasonNote(profile.gamesFromEspn) : "Totals from the box score of every game on record."}>{split ? "Regular season" : "Season by season"}</SectionHeader>
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
              <SectionHeader description={sport === "nfl" ? NFL_PLAYOFFS_NOTE : "Playoff games only; ESPN lists these separately from the regular season."}>Playoffs</SectionHeader>
              <PlayerSeasonTable league={league} profile={staged.playoffs} basePath={basePath} careerLabel="Career playoffs" baseSeason={latestRegular} />
            </section>
          )}

          {staged.playin && (
            <section>
              <SectionHeader description="Play-in tournament games, listed separately from the regular season and the playoffs.">Play-In</SectionHeader>
              <PlayerSeasonTable league={league} profile={staged.playin} basePath={basePath} careerLabel="Career play-in" baseSeason={latestRegular} />
            </section>
          )}

          {staged.counted.form.length > 1 && (
            <section>
              <SectionHeader>Recent form</SectionHeader>
              <PlayerFormChart league={league} profile={staged.counted} />
            </section>
          )}

          {staged.counted.best.length > 0 && (
            <section>
              <SectionHeader description={staged.counted.profile.rankNote}>Best games</SectionHeader>
              <PlayerBestGames league={league} profile={staged.counted} />
            </section>
          )}

          {profile.games > 0 && (
            <>
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

              {goals && goals.clocks.length > 0 && (
                <section>
                  <SectionHeader>Goals by minute</SectionHeader>
                  <GoalMinutesChart bands={bands} reports={goals.reports} games={profile.games} />
                </section>
              )}

              <section>
                <SectionHeader description="Every opponent faced, most often first.">Against each opponent</SectionHeader>
                <PlayerSplitsTable league={league} profile={profile} rows={profile.opponents} firstColumn="Opponent" linkTeams />
              </section>

              {profile.milestones.length > 0 && (
                <section>
                  <SectionHeader description="Landmarks within the games on record, pinned to the game they came in.">Milestones</SectionHeader>
                  <PlayerMilestones league={league} profile={profile} />
                </section>
              )}
            </>
          )}

          <AdSlot label="Player page middle" />

          <section>
            <SectionHeader description={`Every ${LEAGUE_LABEL[league]} game on record, latest season open.`}>Game log</SectionHeader>
            <PlayerGameLogTable league={league} profile={profile} rows={staged.log} split={split} />
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
              {profile.games > 0 && (
                <>
                  Regular-season figures are summed from the {sport === "nfl" ? profile.rows.length : profile.games} {LEAGUE_LABEL[league]} regular-season games {sport === "nfl" ? "with a recorded stat line" : "on record"} here
                  {since ? ` since ${since}` : ""}.{" "}
                </>
              )}
              Playoff and play-in games are shown separately; preseason, All-Star and NBA Cup final games are listed in the game log but not counted, matching ESPN.
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
