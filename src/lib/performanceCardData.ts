import { createElement, type ReactElement } from "react";
import { isLeague, getGameByEspnId, getPlayerBySlug, getPlayerLog, getPlayerReportedGames, getPlayerEspnSeasons, type GameRow, type League, type PlayerRow } from "./queries";
import { buildStagedProfile, playerSport, type PlayerLogRow, type PlayerProfile, type PlayerSport, type StagedProfile } from "./playerProfile";
import type { GameStage } from "./gameStage";
import { performanceLine, type PerformanceStat } from "./performanceLine";
import { PerformanceCard } from "@/components/PerformanceCard";
import { gameRoundLabel } from "./stage";
import { formatGameDate } from "./gameDay";

/**
 * The leagues performance cards exist for — every other league returns null, the same guarantee as
 * the card route's 404. Phase 1/2 was NBA and NFL only. This one array is the source of both the
 * type and the runtime check, so the two can never disagree.
 */
export const PERFORMANCE_CARD_LEAGUES = ["nba", "nfl", "mlb"] as const;
export type PerformanceCardLeague = (typeof PERFORMANCE_CARD_LEAGUES)[number];
const SUPPORTED_LEAGUES = new Set<string>(PERFORMANCE_CARD_LEAGUES);

/**
 * Whether a league has per-game player cards, so a box-score row, a best-games row, a milestone and
 * a match-leaders row all decide alike whether to show the share button. One predicate rather than
 * the four copies of `league === "nba" || league === "nfl"` these surfaces used to carry, each of
 * which could be widened without the others and offer a button whose route 404s. A type predicate,
 * so a caller that has checked it may pass the league straight to `performancePagePath`.
 */
export function supportsPerformanceCards(league: League): league is PerformanceCardLeague {
  return SUPPORTED_LEAGUES.has(league);
}

/** The same check over a `PlayerSport`: every card league's sport has the league's own name. */
const isCardSport = (sport: PlayerSport | null): sport is PerformanceCardLeague => sport !== null && SUPPORTED_LEAGUES.has(sport);

// Reuses queries.ts's own PlayerRow (what getPlayerBySlug actually returns) rather than declaring a
// second, narrower type of the same name — that would either silently shadow the real one or, if
// TypeScript caught the mismatch (its `position`/`jersey` are optional there, not required), fail to
// compile on the very first assignment. No new player type here.
export interface PerformanceCardData {
  league: PerformanceCardLeague;
  game: GameRow;
  player: PlayerRow;
  row: PlayerLogRow;
  profile: PlayerProfile;
  stageProfile: PlayerProfile | null;
  sport: PerformanceCardLeague;
  stats: PerformanceStat[];
  teamColor: string | null;
  isHomeTeam: boolean;
}

// Loads and validates a (league, game, player) triple exactly like the card route's own checks —
// null wherever that route would 404, so the route, the page and its opengraph-image can never
// disagree about which pairs exist. No caller repeats this validation.
export async function loadPerformanceCardData(league: string, id: string, slug: string): Promise<PerformanceCardData | null> {
  if (!isLeague(league) || !supportsPerformanceCards(league)) return null;

  const [game, player] = await Promise.all([getGameByEspnId(league, id), getPlayerBySlug(league, slug)]);
  if (!game || !player) return null;

  // Each card league's sport has the league's own name, but `playerSport` is still asked rather than
  // assumed, because it is the source of truth for which spec set a profile is built from. The guard
  // is unreachable at runtime and is what satisfies `PerformanceCardData.sport` for tsc.
  const sport = playerSport(league);
  if (!isCardSport(sport)) return null;

  const [log, reportedGames, espnSeasons] = await Promise.all([getPlayerLog(league, player.espn_id), getPlayerReportedGames(league, player.espn_id), getPlayerEspnSeasons(league, player.espn_id)]);
  const row = log.find((r) => r.game_espn_id === id);
  if (!row) return null;

  const staged = buildStagedProfile(sport, log, reportedGames, espnSeasons);
  const profile = staged.regular;
  const stageProfile = stageProfileFor(staged, row.stage);
  const stats = performanceLine(sport, row, profile);
  const isHomeTeam = row.team_espn_id === game.home_team_espn_id;
  const teamColor = isHomeTeam ? game.home_color : game.away_color;

  return { league, game, player, row, profile, stageProfile, sport, stats, teamColor, isHomeTeam };
}

// The profile whose `.rows`/`.seasons` are the correct comparison set for a row of this stage —
// regular-season and playoff/play-in games must never be compared against each other for
// "Season high" purposes. Null for "excluded"-stage rows, which belong to no comparison set.
export function stageProfileFor(staged: StagedProfile, stage: GameStage): PlayerProfile | null {
  if (stage === "playoffs") return staged.playoffs;
  if (stage === "playin") return staged.playin;
  if (stage === "regular" || stage === "other") return staged.regular;
  return null;
}

// The single place that builds the new performance page's URL — box-score rows and match leaders
// both link here, so the path shape only needs to be right in one place.
export function performancePagePath(league: PerformanceCardLeague, gameId: string, slug: string): string {
  return `/${league}/games/${gameId}/players/${slug}`;
}

// The single place that maps loaded data onto PerformanceCard's props — the card route and the new
// page's opengraph-image both call this, so there is exactly one render path, never two to drift.
export function buildPerformanceCardElement(data: PerformanceCardData): ReactElement {
  const { league, game, player, row, stats, teamColor } = data;
  return createElement(PerformanceCard, {
    league,
    playerName: player.name,
    position: player.position ?? null,
    jersey: player.jersey ?? null,
    teamAbbr: row.team_abbr,
    teamColor,
    opponentAbbr: row.opponent_abbr,
    resultLetter: row.result === "W" || row.result === "L" ? row.result : null,
    teamScore: row.team_score,
    opponentScore: row.opponent_score,
    date: formatGameDate(game.date, league, { month: "short", day: "numeric", year: "numeric" }),
    stageLabel: gameRoundLabel(game),
    stats,
  });
}
