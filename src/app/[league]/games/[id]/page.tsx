import type { Metadata } from "next";
import { teamDisplayName } from "@/lib/teamName";
import { notFound } from "next/navigation";
import { isLeague, isCricketLeague, isFirstClassCricket, LEAGUE_LABEL, getGameByEspnId, getGameDetails, getPlayerSlugsByEspnIds, isSoccerLeague } from "@/lib/queries";
import { pageMeta } from "@/lib/metadata";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { HeadToHeadStrip } from "@/components/HeadToHeadStrip";
import { JsonLd } from "@/components/JsonLd";
import { gameSchema } from "@/lib/structuredData";
import { fetchMatchSummary, extractGameDetails, type GameDetails, type MatchSport } from "@/lib/matchDetail";
import { getMatchContext } from "@/lib/matchContext";
import { AdSlot } from "@/components/AdSlot";
import { MatchHeader } from "@/components/MatchHeader";
import { LiveRefresh } from "@/components/LiveRefresh";
import { SectionHeader } from "@/components/SectionHeader";
import { TeamStatsComparison } from "@/components/TeamStatsComparison";
import { PlayerBoxScoreTable } from "@/components/PlayerBoxScoreTable";
import { CricketScorecards } from "@/components/CricketScorecard";
import { ViewTracker } from "@/components/ViewTracker";
import { MatchFacts } from "@/components/MatchFacts";
import { MatchTimeline } from "@/components/MatchTimeline";
import { MatchLineups } from "@/components/MatchLineups";
import { MatchContextCard } from "@/components/MatchContextCard";
import { WinProbabilityChart } from "@/components/WinProbabilityChart";
import { MatchLeaders } from "@/components/MatchLeaders";
import { GameCard } from "@/components/GameCard";
import { RelatedLinks } from "@/components/RelatedLinks";
import { h2hPath } from "@/lib/h2h";
import { supportsScoreAnalytics } from "@/lib/analytics";
import { supportsMatchweeks, weekIndexPath, weekNoun } from "@/lib/matchweeks";
import { formatSeasonLabel } from "@/lib/queries";
import type { League } from "@/lib/queries";

// Completed games read their stored report from the database. Games in progress (or
// not yet backfilled) fall back to a live fetch (see lib/matchDetail.ts), so the
// revalidation window keeps a live game fresh without hitting ESPN on every request.
// Short so a game in play tracks the feed; the page re-renders in the browser every
// 10 seconds while live, and finished games are served from stored details anyway.
export const revalidate = 10;

function sportOf(league: League): MatchSport {
  return isSoccerLeague(league) ? "soccer" : isCricketLeague(league) ? "cricket" : "american";
}

async function loadDetails(league: League, id: string, homeId: string, awayId: string, completed: boolean): Promise<{ details: GameDetails | null; stored: boolean }> {
  if (completed) {
    const stored = await getGameDetails(league, id);
    if (stored) return { details: stored, stored: true };
  }
  const summary = await fetchMatchSummary(league, id);
  return { details: summary ? extractGameDetails(sportOf(league), summary, homeId, awayId) : null, stored: false };
}

function scorersLine(details: GameDetails | null): string {
  if (!details) return "";
  const goals = details.events.filter((e) => (e.type === "goal" || e.type === "penalty" || e.type === "own-goal") && e.players[0]);
  if (goals.length === 0) return "";
  return ` Goals: ${goals.map((g) => `${g.players[0].name} ${g.clock}`).join(", ")}.`;
}

export async function generateMetadata({ params }: { params: Promise<{ league: string; id: string }> }): Promise<Metadata> {
  const { league, id } = await params;
  if (!isLeague(league)) return {};
  const game = await getGameByEspnId(league, id);
  if (!game) return {};
  const date = new Date(game.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  // The NFL and NBA name the visitors first ("Chiefs at Bills"); football and cricket
  // name the home side first.
  const awayFirst = league === "nfl" || league === "nba";
  const [first, second] = awayFirst ? ([game.away_name, game.home_name] as const) : ([game.home_name, game.away_name] as const);
  const awayScore = game.away_score_display ?? game.away_score;
  const homeScore = game.home_score_display ?? game.home_score;
  const score = game.completed && game.away_score != null && game.home_score != null ? (awayFirst ? ` ${awayScore}-${homeScore}` : ` ${homeScore}-${awayScore}`) : "";
  const details = game.completed ? await getGameDetails(league, id) : null;
  const where = details?.venue ? ` at ${details.venue}` : "";
  const covers = isCricketLeague(league) ? "Scorecard and head-to-head." : isSoccerLeague(league) ? "Line-ups, timeline, team stats, box score and head-to-head." : "Scoring summary, win probability, team stats, box score and head-to-head.";
  const extras = game.completed ? `${scorersLine(details)} ${covers}` : isCricketLeague(league) ? " Head-to-head record and recent form." : " Team form, head-to-head record and pre-match win probability.";
  // A Test's two-innings score line ("254 & 258 (95.2 ov, target 271)") is too long
  // for a title; the month names the match and the description carries the result.
  if (isFirstClassCricket(league)) {
    const month = new Date(game.date).toLocaleDateString("en-US", { month: "long", year: "numeric" });
    const result = game.completed && game.status_summary ? ` ${teamDisplayName(game.status_summary)}.` : "";
    return pageMeta(
      `${teamDisplayName(first)} v ${teamDisplayName(second)} Test, ${month}`,
      `${teamDisplayName(first)} v ${teamDisplayName(second)}${where}, ${date}.${result} Full scorecard of all four innings and head-to-head.`,
      `/${league}/games/${id}`,
      { ownImage: true }
    );
  }
  return pageMeta(
    `${teamDisplayName(first)} vs ${teamDisplayName(second)}${score}`,
    `${LEAGUE_LABEL[league]}: ${teamDisplayName(first)} ${awayFirst ? "at" : "v"} ${teamDisplayName(second)}${where}, ${date}.${extras}`,
    `/${league}/games/${id}`,
    { ownImage: true }
  );
}

export default async function GameDetailPage({ params }: { params: Promise<{ league: string; id: string }> }) {
  const { league, id } = await params;
  if (!isLeague(league)) notFound();

  const game = await getGameByEspnId(league, id);
  if (!game) notFound();

  const [{ details, stored }, context] = await Promise.all([
    loadDetails(league, id, game.home_team_espn_id, game.away_team_espn_id, game.completed),
    getMatchContext(league, game),
  ]);

  const isCricket = isCricketLeague(league);
  const teamStats = details?.team_stats ?? [];
  const playerBox = details?.player_box ?? [];
  const cricketScorecard = details?.scorecard ?? [];
  // Soccer's box score source (rosters[]) always has one entry per team, even before
  // kickoff — it's just the squad list, so categories comes back empty rather than the
  // array itself. playerBox.length alone can't tell "no stats yet" from "has stats".
  const hasPlayerStats = playerBox.some((team) => team.categories.length > 0);

  const athleteIds = new Set<string>();
  for (const team of playerBox) for (const cat of team.categories) for (const row of cat.rows) athleteIds.add(row.athleteId);
  for (const team of cricketScorecard) {
    for (const row of team.battingRows) athleteIds.add(row.athleteId);
    for (const row of team.bowlingRows) athleteIds.add(row.athleteId);
  }
  for (const e of details?.events ?? []) for (const p of e.players) athleteIds.add(p.id);
  for (const l of details?.lineups ?? []) for (const p of [...l.starters, ...l.subs]) athleteIds.add(p.id);
  for (const l of details?.leaders ?? []) athleteIds.add(l.athlete_id);
  const playerSlugs = await getPlayerSlugsByEspnIds(league, [...athleteIds]);

  // The feed's boxscore.teams order differs by sport (home first for soccer, away
  // first for the US leagues), so match by team id rather than position.
  const awayStats = teamStats.find((t) => t.teamId === game.away_team_espn_id) ?? teamStats[0];
  const homeStats = teamStats.find((t) => t.teamId === game.home_team_espn_id) ?? teamStats[1];
  // Before a game starts, ESPN's "boxscore" is actually each team's season-to-date
  // per-game averages (entering the matchup) — there's no real box score yet since
  // nothing's been played. Labeling that "Team Stats" the same way a completed game's
  // real box score is labeled reads as if these numbers are from this game, which
  // they aren't — so call it out explicitly instead of leaving it ambiguous.
  const notYetStarted = game.status_state === "pre";
  const events = details?.events ?? [];
  const lineups = details?.lineups ?? [];
  const winProb = details?.win_probability ?? [];
  const leaders = details?.leaders ?? [];

  const awayFirst = league === "nfl" || league === "nba";
  const matchName = awayFirst ? `${teamDisplayName(game.away_name)} vs ${teamDisplayName(game.home_name)}` : `${teamDisplayName(game.home_name)} vs ${teamDisplayName(game.away_name)}`;

  return (
    <div className="flex flex-col gap-6">
      <ViewTracker league={league} gameId={id} />
      <JsonLd data={gameSchema(league, game, details?.venue ?? null)} />
      <Breadcrumbs
        items={[
          { label: LEAGUE_LABEL[league], href: `/${league}` },
          ...(context?.week ? [{ label: context.week.label, href: context.week.href }] : [{ label: "Scores", href: `/${league}` }]),
          { label: matchName },
        ]}
      />
      <LiveRefresh active={game.status_state === "in"} />
      {/* The scoreboard card below is the visual heading; this names the page for screen readers and crawlers. */}
      <h1 className="sr-only">
        {matchName}, {LEAGUE_LABEL[league]},{" "}
        {new Date(game.date).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
      </h1>
      <MatchHeader league={league} game={game} />
      {details && <MatchFacts league={league} game={game} details={details} />}

      <AdSlot label="Match detail top" />

      {context && (
        <section>
          <SectionHeader description={game.completed ? "Ratings, form and standing before and after this game, from every result on record." : "Ratings and form going into this game, from every result on record."}>
            {game.completed ? "Before and after" : "Going in"}
          </SectionHeader>
          <MatchContextCard league={league} game={game} context={context} />
        </section>
      )}

      {!isCricket && <HeadToHeadStrip league={league} homeSlug={game.home_slug} awaySlug={game.away_slug} excludeGameId={game.completed ? game.espn_id : null} />}

      {!details && <p className="card px-4 py-6 text-sm text-[var(--text-muted)]">Match details aren&apos;t available right now.</p>}

      {(game.broadcast_network || game.weather_display) && (
        <div className="card flex flex-wrap gap-x-6 gap-y-1 px-4 py-3 text-sm text-[var(--text-muted)]">
          {game.broadcast_network && (
            <span>
              <span className="font-semibold text-[var(--text)]">Watch:</span> {game.broadcast_network}
            </span>
          )}
          {game.weather_display && (
            <span>
              <span className="font-semibold text-[var(--text)]">Weather:</span> {game.weather_display}
              {game.weather_temperature !== null && game.weather_temperature !== undefined ? `, ${game.weather_temperature}°F` : ""}
            </span>
          )}
        </div>
      )}

      {events.length > 0 && (
        <section>
          <SectionHeader>{isSoccerLeague(league) ? "Timeline" : "Scoring summary"}</SectionHeader>
          <MatchTimeline league={league} game={game} events={events} playerSlugs={playerSlugs} />
        </section>
      )}

      {winProb.length > 1 && (
        <section>
          <SectionHeader>Win probability</SectionHeader>
          <WinProbabilityChart game={game} points={winProb} />
        </section>
      )}

      {lineups.length > 0 && (
        <section>
          <SectionHeader>Line-ups</SectionHeader>
          <MatchLineups league={league} game={game} lineups={lineups} playerSlugs={playerSlugs} />
        </section>
      )}

      {awayStats && homeStats && (
        <section>
          <SectionHeader>{notYetStarted ? "Season Comparison" : "Team Stats"}</SectionHeader>
          {notYetStarted && (
            <p className="-mt-2 mb-3 text-xs text-[var(--text-muted)]">
              Season averages coming into this game. It hasn&apos;t been played yet.
            </p>
          )}
          <TeamStatsComparison away={awayStats} home={homeStats} />
        </section>
      )}

      {leaders.length > 0 && (
        <section>
          <SectionHeader>Game leaders</SectionHeader>
          <MatchLeaders league={league} game={game} leaders={leaders} playerSlugs={playerSlugs} />
        </section>
      )}

      {isCricket && cricketScorecard.length > 0 && (
        <section className="flex flex-col gap-4">
          <SectionHeader>Scorecard</SectionHeader>
          <CricketScorecards league={league} scorecard={cricketScorecard} playerSlugs={playerSlugs} />
        </section>
      )}

      {!isCricket && hasPlayerStats && (
        <section className="flex flex-col gap-4">
          <SectionHeader>Player Stats</SectionHeader>
          {playerBox.map((team) => (
            <PlayerBoxScoreTable key={team.teamId} league={league} team={team} playerSlugs={playerSlugs} />
          ))}
        </section>
      )}

      {context && context.week && context.weekGames.length > 0 && (
        <section>
          <SectionHeader action={{ label: `All of ${context.week.label}`, href: context.week.href }}>More from {context.week.label}</SectionHeader>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {context.weekGames.slice(0, 9).map((g) => (
              <GameCard key={g.espn_id} league={league} game={g} />
            ))}
          </div>
        </section>
      )}

      <RelatedLinks
        groups={[
          {
            title: "Teams",
            links: [
              { href: `/${league}/teams/${game.home_slug}`, label: teamDisplayName(game.home_name), sub: "Schedule, results and roster", image: game.home_logo, imageName: teamDisplayName(game.home_name) },
              { href: `/${league}/teams/${game.away_slug}`, label: teamDisplayName(game.away_name), sub: "Schedule, results and roster", image: game.away_logo, imageName: teamDisplayName(game.away_name) },
              ...(game.season_year
                ? [
                    { href: `/${league}/teams/${game.home_slug}/${game.season_year}`, label: `${teamDisplayName(game.home_name)} ${formatSeasonLabel(league, game.season_year)}`, sub: "Every result that season" },
                    { href: `/${league}/teams/${game.away_slug}/${game.season_year}`, label: `${teamDisplayName(game.away_name)} ${formatSeasonLabel(league, game.season_year)}`, sub: "Every result that season" },
                  ]
                : []),
            ],
          },
          {
            title: "Head-to-head",
            links: supportsScoreAnalytics(league)
              ? [
                  { href: h2hPath(league, game.home_slug, game.away_slug), label: `${teamDisplayName(game.away_name)} vs ${teamDisplayName(game.home_name)}`, sub: "All-time record and every meeting" },
                  { href: `/${league}/compare?a=${game.home_slug}&b=${game.away_slug}`, label: "Compare the two teams", sub: "Season stats side by side" },
                ]
              : [],
          },
          {
            title: game.season_year ? `${formatSeasonLabel(league, game.season_year)} season` : "This season",
            links: [
              ...(game.season_year ? [{ href: `/${league}/standings/${game.season_year}`, label: `${formatSeasonLabel(league, game.season_year)} standings` }] : []),
              ...(supportsMatchweeks(league) && game.season_year ? [{ href: weekIndexPath(league, game.season_year), label: `Every ${weekNoun(league).toLowerCase()} of ${formatSeasonLabel(league, game.season_year)}` }] : []),
              { href: `/${league}/leaders`, label: `${LEAGUE_LABEL[league]} leaders` },
            ],
          },
        ]}
      />

      {stored && <p className="text-[11px] text-[var(--text-faint)]">Match report stored from the official feed after the final whistle.</p>}
    </div>
  );
}
