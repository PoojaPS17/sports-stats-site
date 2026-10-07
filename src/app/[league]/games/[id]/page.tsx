import type { Metadata } from "next";
import { teamDisplayName } from "@/lib/teamName";
import { notFound } from "next/navigation";
import { isLeague, isCricketLeague, isFirstClassCricket, LEAGUE_LABEL, getGameByEspnId, getGameDetails, getPlayerSlugsByEspnIds, isSoccerLeague } from "@/lib/queries";
import { fitTitle, pageMeta } from "@/lib/metadata";
import { formatGameDate } from "@/lib/gameDay";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { HeadToHeadStrip } from "@/components/HeadToHeadStrip";
import { JsonLd } from "@/components/JsonLd";
import { gameSchema } from "@/lib/structuredData";
import { fetchMatchSummary, extractGameDetails, presentDetails, type GameDetails, type MatchSport } from "@/lib/matchDetail";
import { getMatchContext } from "@/lib/matchContext";
import { gameDescription, gameLeadersShown, gameSections, gameSides, hasNoBoxScore, hasTeamStats, matchContextView, matchupLabel, scoreLineHomeFirst, NO_BOX_SCORE_NOTE, teamStatsFraming } from "@/lib/gamePage";
import { AdSlot } from "@/components/AdSlot";
import { MatchHeader } from "@/components/MatchHeader";
import { CricketMatchHero } from "@/components/CricketMatchHero";
import { CricketMatchStory } from "@/components/CricketMatchStory";
import { deriveMatchStory, fetchCricketBallByBall, shouldFetchStory } from "@/lib/cricketBalls";
import { cssColour, liveStatusLine, matchPills, potmLine, seriesNote } from "@/lib/cricketMatchExtras";
import { CricketKeyMoments } from "@/components/CricketKeyMoments";
import { CricketTopPerformers } from "@/components/CricketTopPerformers";
import { CricketPartnerships } from "@/components/CricketPartnerships";
import { CricketNextMatch } from "@/components/CricketNextMatch";
import { keyMoments, parseMilestones } from "@/lib/cricketMatchMoments";
import { topPerformers } from "@/lib/cricketPerformers";
import { getCricketSeriesMatch, getCricketSeriesMatches } from "@/lib/cricketSeries";
import { fetchCricketSummaryLive, LIVE_REVALIDATE } from "@/lib/cricketLive";
import { FINISHED_MATCH_REVALIDATE } from "@/lib/cricketMatchCache";
import { sideScoreText } from "@/lib/gameDisplay";
import { venueWithCity } from "@/components/MatchFacts";
import { LiveRefresh } from "@/components/LiveRefresh";
import { SectionHeader } from "@/components/SectionHeader";
import { TeamStatsComparison } from "@/components/TeamStatsComparison";
import { ImageActions } from "@/components/ImageActions";
import { TeamStatsExportCard } from "@/components/TeamStatsExportCard";
import { MatchTimelineExportCard } from "@/components/MatchTimelineExportCard";
import { MatchLineupsExportCard } from "@/components/MatchLineupsExportCard";
import { MatchLeadersExportCard } from "@/components/MatchLeadersExportCard";
import { PlayerBoxScoreExportCard } from "@/components/PlayerBoxScoreExportCard";
import { CricketScorecardExportCard } from "@/components/CricketScorecardExportCard";
import { MatchScoreHeader } from "@/components/MatchScoreHeader";
import { PlayerBoxScoreTable } from "@/components/PlayerBoxScoreTable";
import { CricketScorecardTabs } from "@/components/CricketScorecardTabs";
import { CricketScorecardPanel } from "@/components/CricketScorecardPanel";
import { scorecardTabs } from "@/lib/cricketScorecardView";
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
import { gameSeasonLinks } from "@/lib/gameLinks";
import { formatSeasonLabel } from "@/lib/queries";
import type { League } from "@/lib/queries";
import { SOCCER_CARDS_NOTE } from "@/lib/playerCopy";

// Completed games read their stored report from the database. Games in progress (or
// not yet backfilled) fall back to a live fetch (see lib/matchDetail.ts), so the
// revalidation window keeps a live game fresh without hitting ESPN on every request.
// Short so a game in play tracks the feed; the page re-renders in the browser every
// 10 seconds while live, and finished games are served from stored details anyway.
export const revalidate = 10;

// Dynamic on purpose: no generateStaticParams here, so the state of the match is read fresh each time.
// It renders on every request and answers no-store: a cached render is up to 5 minutes old
// (expireTime in next.config.ts), and a render made in the pre state ships no LiveRefresh timer,
// so it would not catch up on its own. The window above still sets the default for the cached
// fetches inside this render. A game that is over with its report stored does not come here at all:
// the proxy rewrites it to ../final/[id], this same page cached for a day (see lib/gameCache.ts).

function sportOf(league: League): MatchSport {
  return isSoccerLeague(league) ? "soccer" : isCricketLeague(league) ? "cricket" : "american";
}

/* eslint-disable @typescript-eslint/no-explicit-any -- ESPN feed JSON has no published schema */
async function loadDetails(league: League, id: string, homeId: string, awayId: string, completed: boolean): Promise<{ details: GameDetails | null; stored: boolean; summary: any | null }> {
  if (completed) {
    const stored = await getGameDetails(league, id);
    if (stored) return { details: stored, stored: true, summary: null };
  }
  // The international formats have no path of their own in SPORT_PATH; any cricket match resolves through the IPL id.
  const summary = (await fetchMatchSummary(league, id)) ?? (sportOf(league) === "cricket" ? await fetchCricketSummaryLive(id, "8048", { revalidate: completed ? FINISHED_MATCH_REVALIDATE : LIVE_REVALIDATE }) : null);
  return { details: summary ? presentDetails(extractGameDetails(sportOf(league), summary, homeId, awayId)) : null, stored: false, summary };
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
  const date = formatGameDate(game.date, league, { month: "short", day: "numeric", year: "numeric" }, game.local_date);
  // The NFL and NBA name the visitors first ("Chiefs at Bills"); football and cricket
  // name the home side first.
  const { first, second, awayFirst } = gameSides(league, game);
  // A cricket score carries its overs and target ("151/1 (15.3/20 ov, target 148)");
  // the title keeps runs and wickets only.
  const bare = (v: string | number | null) => (typeof v === "string" ? v.replace(/\s*\([^)]*\)/g, "").trim() : v);
  const awayScore = bare(game.away_score_display ?? game.away_score);
  const homeScore = bare(game.home_score_display ?? game.home_score);
  const score = game.completed && game.away_score != null && game.home_score != null ? (awayFirst ? ` ${awayScore}-${homeScore}` : ` ${homeScore}-${awayScore}`) : "";
  const details = game.completed ? await getGameDetails(league, id) : null;
  const where = details?.venue ? ` at ${details.venue}` : "";
  // A finished game ESPN published no player statistics for says so rather than promising a box score.
  const boxScore = !(details && !isCricketLeague(league) && hasNoBoxScore(game, details.player_box));
  const description = gameDescription(league, game, date, where, game.completed ? scorersLine(details) : "", boxScore);
  // A Test's two-innings score line ("254 & 258 (95.2 ov, target 271)") is too long
  // for a title; the month names the match and the description carries the result.
  if (isFirstClassCricket(league)) {
    const month = formatGameDate(game.date, league, { month: "long", year: "numeric" }, game.local_date);
    return pageMeta(`${teamDisplayName(first)} v ${teamDisplayName(second)} Test, ${month}`, description, `/${league}/games/${id}`, { ownImage: true });
  }
  // When two long names and a score would not fit a search result the score goes, then (if it fits) the date stands in for it.
  const sides = `${teamDisplayName(first)} vs ${teamDisplayName(second)}`;
  return pageMeta(fitTitle(`${sides}${score}`, `${sides}, ${date}`, sides), description, `/${league}/games/${id}`, { ownImage: true });
}

export default async function GameDetailPage({ params }: { params: Promise<{ league: string; id: string }> }) {
  const { league, id } = await params;
  if (!isLeague(league)) notFound();

  const game = await getGameByEspnId(league, id);
  if (!game) notFound();

  const isCricket = isCricketLeague(league);
  const [loaded, context, balls, seriesMatch] = await Promise.all([
    loadDetails(league, id, game.home_team_espn_id, game.away_team_espn_id, game.completed),
    getMatchContext(league, game),
    // The match story needs every ball: limited-overs cricket only, while in play or recently finished.
    isCricket && !isFirstClassCricket(league) && shouldFetchStory({ state: game.status_state, completed: game.completed, date: game.date }) ? fetchCricketBallByBall(id, "8048", { settled: game.completed }) : Promise.resolve(null),
    // The series this match belongs to, for the next fixture.
    isCricket ? getCricketSeriesMatch(id) : Promise.resolve(null),
  ]);
  const { details, stored } = loaded;
  // A stored cricket result still reads ESPN's summary once (cached with the page) for the Player of the Match and the notes; nothing waits on it failing.
  const summary: any | null = isCricket ? (loaded.summary ?? (await fetchCricketSummaryLive(id, "8048", { revalidate: game.completed ? FINISHED_MATCH_REVALIDATE : LIVE_REVALIDATE }))) : null;
  const story = balls ? deriveMatchStory(balls) : [];
  const playerOfTheMatch: string | null = summary?.header?.competitions?.[0]?.status?.featuredAthletes?.find((a: any) => a.name === "playerOfTheMatch")?.athlete?.displayName ?? null;
  const teamStats = details?.team_stats ?? [];
  const playerBox = details?.player_box ?? [];
  const cricketScorecard = details?.scorecard ?? [];
  // Soccer's box score source (rosters[]) always has one entry per team, even before
  // kickoff — it's just the squad list, so categories comes back empty rather than the
  // array itself. playerBox.length alone can't tell "no stats yet" from "has stats".
  const hasPlayerStats = playerBox.some((team) => team.categories.length > 0);
  // A finished game whose box lists every player with minutes "--" and zeros: ESPN published no statistics.
  const noBoxScore = !isCricket && hasNoBoxScore(game, playerBox);

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
  // they aren't — so call it out explicitly instead of leaving it ambiguous. A game
  // ESPN closed without playing (state "post", not completed) keeps sending those
  // averages, so it gets the same treatment with wording that says it was called off.
  const statsFraming = teamStatsFraming(league, game);
  const show = gameSections(game);
  const contextView = matchContextView(league, game);
  const events = details?.events ?? [];
  const lineups = show.lineups ? (details?.lineups ?? []) : [];
  const winProb = show.winProbability ? (details?.win_probability ?? []) : [];
  const leaders = gameLeadersShown(show, noBoxScore, details?.leaders);

  // The heading, breadcrumb and share titles name the matchup as every other label on the page does (`matchupLabel`).
  const matchName = matchupLabel(league, game);
  // The sides' stored colours as the hero's edge bars; none when either is missing or they match.
  const homeColour = cssColour(game.home_color);
  const awayColour = cssColour(game.away_color);
  const heroColours = homeColour && awayColour && homeColour !== awayColour ? { home: homeColour, away: awayColour } : { home: null, away: null };
  const storyColours: Record<string, string> = {};
  if (heroColours.home) storyColours[game.home_team_espn_id] = heroColours.home;
  if (heroColours.away) storyColours[game.away_team_espn_id] = heroColours.away;
  // The story blocks: wickets and landmarks, the innings leaders, the stands, the series' next fixture.
  const names = cricketScorecard.flatMap((t) => [...t.battingRows, ...t.bowlingRows].map((r) => r.name));
  const moments = isCricket ? keyMoments(story, parseMilestones(summary?.notes, names), cricketScorecard) : [];
  const performers = isCricket ? topPerformers(cricketScorecard, playerOfTheMatch) : { large: null, small: [] };
  const teamNames: Record<string, string> = { [game.home_team_espn_id]: teamDisplayName(game.home_name), [game.away_team_espn_id]: teamDisplayName(game.away_name) };
  const nextMatch = seriesMatch ? ((await getCricketSeriesMatches(seriesMatch.series_espn_id)).find((m) => m.espn_id !== seriesMatch.espn_id && m.date > seriesMatch.date && m.status_state === "pre") ?? null) : null;

  return (
    <div className="flex flex-col gap-6">
      <ViewTracker league={league} gameId={id} />
      <JsonLd data={gameSchema(league, game, details?.venue ?? null, details?.scorecard)} />
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
        {formatGameDate(game.date, league, { month: "long", day: "numeric", year: "numeric" }, game.local_date)}
      </h1>
      {isCricket ? (
        <CricketMatchHero
          headingTag="p"
          state={game.status_state === "in" ? "in" : game.status_state === "post" ? "post" : "pre"}
          calledOff={game.status_state === "post" && !game.completed ? (game.status_detail ?? "Called off") : null}
          headline={[matchName, LEAGUE_LABEL[league], game.round].filter(Boolean).join(" · ")}
          date={game.date}
          sides={[
            { name: teamDisplayName(game.home_name), score: sideScoreText(league, game.home_score, game.home_score_display, game.completed) ?? "", winner: game.home_winner ?? (game.home_score ?? 0) > (game.away_score ?? 0), logo: game.home_logo, colour: heroColours.home },
            { name: teamDisplayName(game.away_name), score: sideScoreText(league, game.away_score, game.away_score_display, game.completed) ?? "", winner: game.away_winner ?? (game.away_score ?? 0) > (game.home_score ?? 0), logo: game.away_logo, colour: heroColours.away },
          ]}
          result={game.completed && game.status_summary ? teamDisplayName(game.status_summary) : null}
          potm={playerOfTheMatch ? { name: playerOfTheMatch, line: details ? potmLine(details.scorecard, playerOfTheMatch) : null } : null}
          pills={matchPills(summary?.notes)}
          liveLine={game.status_state === "in" ? liveStatusLine(teamDisplayName(game.status_summary ?? game.status_detail ?? null), story.at(-1)) : null}
          venue={details?.venue ? venueWithCity(details.venue, details.city) : null}
        />
      ) : (
        <MatchHeader league={league} game={game} scorecard={cricketScorecard} />
      )}
      {details && <MatchFacts league={league} game={game} details={show.playFacts ? details : { ...details, officials: [], attendance: null, linescores: null }} />}

      <AdSlot label="Match detail top" />

      {story.length > 0 && <CricketMatchStory innings={story} colours={storyColours} />}

      {(moments.length > 0 || performers.large) && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start">
          <CricketKeyMoments moments={moments} colours={storyColours} teams={teamNames} />
          <CricketTopPerformers large={performers.large} small={performers.small} league={league} playerSlugs={playerSlugs} teams={teamNames} largeLabel={playerOfTheMatch && performers.large?.name === playerOfTheMatch ? "Player of the Match" : "Top scorer"} />
        </div>
      )}

      {isCricket && <CricketPartnerships innings={story} colours={storyColours} />}

      {context && (
        <section>
          <SectionHeader description={contextView.description}>{contextView.title}</SectionHeader>
          <MatchContextCard league={league} game={game} context={context} view={contextView} />
        </section>
      )}

      {!isCricket && <HeadToHeadStrip league={league} homeSlug={game.home_slug} awaySlug={game.away_slug} excludeGameId={game.completed ? game.espn_id : null} />}

      {!details && show.detailsMissingNote && <p className="card px-4 py-6 text-sm text-[var(--text-muted)]">Match details aren&apos;t available right now.</p>}

      {/* The broadcast and forecast belong to the slot the game was scheduled for; once it is called off they are stale. */}
      {show.broadcastStrip && (game.broadcast_network || game.weather_display) && (
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
          <SectionHeader
            description={isSoccerLeague(league) ? SOCCER_CARDS_NOTE : undefined}
            tools={
              <ImageActions
                filename={`${id}-${isSoccerLeague(league) ? "timeline" : "scoring"}-${league}`}
                shareTitle={`${matchName} ${isSoccerLeague(league) ? "timeline" : "scoring summary"}`}
                card={<MatchTimelineExportCard league={league} game={game} events={events} title={isSoccerLeague(league) ? "Timeline" : "Scoring summary"} />}
              />
            }
          >
            {isSoccerLeague(league) ? "Timeline" : "Scoring summary"}
          </SectionHeader>
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
          <SectionHeader tools={<ImageActions filename={`${id}-lineups-${league}`} width={860} shareTitle={`${matchName} line-ups`} card={<MatchLineupsExportCard league={league} game={game} lineups={lineups} />} />}>Line-ups</SectionHeader>
          <MatchLineups league={league} game={game} lineups={lineups} playerSlugs={playerSlugs} />
        </section>
      )}

      {awayStats && homeStats && hasTeamStats(awayStats, homeStats) && (
        <section>
          <SectionHeader
            description={statsFraming.description}
            tools={
              <ImageActions
                filename={`${id}-team-stats-${league}`}
                shareTitle={`${matchupLabel(league, game)} ${statsFraming.shareLabel}`}
                card={<TeamStatsExportCard league={league} game={game} away={awayStats} home={homeStats} title={statsFraming.cardTitle} />}
              />
            }
          >
            {statsFraming.heading}
          </SectionHeader>
          <TeamStatsComparison away={awayStats} home={homeStats} homeFirst={scoreLineHomeFirst(league)} />
        </section>
      )}

      {leaders.length > 0 && (
        <section>
          <SectionHeader tools={<ImageActions filename={`${id}-leaders-${league}`} width={860} shareTitle={`${matchName} game leaders`} card={<MatchLeadersExportCard league={league} game={game} leaders={leaders} />} />}>Game leaders</SectionHeader>
          <MatchLeaders league={league} game={game} gameId={id} leaders={leaders} playerSlugs={playerSlugs} />
        </section>
      )}

      {isCricket && cricketScorecard.length > 0 && (
        <section className="flex flex-col gap-4">
          <SectionHeader
            tools={
              <ImageActions
                filename={`${id}-scorecard-${league}`}
                width={860}
                shareTitle={`${matchName} scorecard`}
                card={<CricketScorecardExportCard header={<MatchScoreHeader league={league} game={game} scorecard={cricketScorecard} />} context={`${matchName} · Scorecard`} scorecard={cricketScorecard} />}
              />
            }
          >
            Scorecard
          </SectionHeader>
          <CricketScorecardTabs tabs={scorecardTabs(cricketScorecard, story, storyColours).map((t) => ({ key: t.key, label: t.label, colour: t.colour, panel: <CricketScorecardPanel tab={t} league={league} playerSlugs={playerSlugs} /> }))} />
        </section>
      )}

      {noBoxScore && show.playerStats && (
        <section>
          <SectionHeader>Player Stats</SectionHeader>
          <p className="card px-4 py-6 text-sm text-[var(--text-muted)]">{NO_BOX_SCORE_NOTE}</p>
        </section>
      )}

      {!isCricket && !noBoxScore && show.playerStats && hasPlayerStats && (
        <section className="flex flex-col gap-4">
          <SectionHeader tools={<ImageActions filename={`${id}-box-score-${league}`} width={900} shareTitle={`${matchName} box score`} card={<PlayerBoxScoreExportCard league={league} game={game} playerBox={playerBox} />} />}>Player Stats</SectionHeader>
          {playerBox.map((team) => (
            <PlayerBoxScoreTable key={team.teamId} league={league} gameId={id} team={team} playerSlugs={playerSlugs} />
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

      {seriesMatch && <CricketNextMatch next={nextMatch} series={{ name: seriesMatch.series_name, href: `/cricket/series/${seriesMatch.series_espn_id}` }} seriesNote={seriesNote(summary?.notes)} />}

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
                  { href: h2hPath(league, game.home_slug, game.away_slug), label: matchupLabel(league, game), sub: "All-time record and every meeting" },
                  { href: `/${league}/compare?a=${game.home_slug}&b=${game.away_slug}`, label: "Compare the two teams", sub: "Season stats side by side" },
                ]
              : [],
          },
          {
            title: game.season_year ? `${formatSeasonLabel(league, game.season_year)} season` : "This season",
            links: gameSeasonLinks(league, game.season_year),
          },
        ]}
      />

      {stored && <p className="text-[11px] text-[var(--text-faint)]">Match report stored from the official feed after the final whistle.</p>}
    </div>
  );
}
