import { createElement, type ReactElement } from "react";
import { isLeague, getGameByEspnId, getPlayerBySlug, getPlayerLog, getPlayerReportedGames, getPlayerEspnSeasons, type GameRow, type PlayerRow } from "./queries";
import { buildStagedProfile, playerSport, type PlayerLogRow, type PlayerProfile } from "./playerProfile";
import { performanceLine, type PerformanceStat } from "./performanceLine";
import { PerformanceCard } from "@/components/PerformanceCard";
import { gameRoundLabel } from "./stage";
import { formatGameDate } from "./gameDay";

// Phase 1/2 is NBA and NFL only — every other league returns null, same guarantee as the card route's 404.
const SUPPORTED_LEAGUES = new Set(["nba", "nfl"]);

// Reuses queries.ts's own PlayerRow (what getPlayerBySlug actually returns) rather than declaring a
// second, narrower type of the same name — that would either silently shadow the real one or, if
// TypeScript caught the mismatch (its `position`/`jersey` are optional there, not required), fail to
// compile on the very first assignment. No new player type here.
export interface PerformanceCardData {
  league: "nba" | "nfl";
  game: GameRow;
  player: PlayerRow;
  row: PlayerLogRow;
  profile: PlayerProfile;
  sport: "nba" | "nfl";
  stats: PerformanceStat[];
  teamColor: string | null;
  isHomeTeam: boolean;
}

// Loads and validates a (league, game, player) triple exactly like the card route's own checks —
// null wherever that route would 404, so the route, the page and its opengraph-image can never
// disagree about which pairs exist. No caller repeats this validation.
export async function loadPerformanceCardData(league: string, id: string, slug: string): Promise<PerformanceCardData | null> {
  if (!isLeague(league) || !SUPPORTED_LEAGUES.has(league)) return null;
  if (league !== "nba" && league !== "nfl") return null; // narrows for tsc, unreachable at runtime (see above)

  const [game, player] = await Promise.all([getGameByEspnId(league, id), getPlayerBySlug(league, slug)]);
  if (!game || !player) return null;

  const sport = playerSport(league);
  if (!sport) return null; // unreachable at runtime; SUPPORTED_LEAGUES already guarantees nba/nfl
  // playerSport()'s real signature returns PlayerSport ("soccer" | "nfl" | "nba") for the full League
  // union, so tsc can't narrow it to "nba" | "nfl" just because `league` already is — same class of
  // gap as the `league` narrowing above. Unreachable at runtime; satisfies PerformanceCardData.sport.
  if (sport !== "nba" && sport !== "nfl") return null;

  const [log, reportedGames, espnSeasons] = await Promise.all([getPlayerLog(league, player.espn_id), getPlayerReportedGames(league, player.espn_id), getPlayerEspnSeasons(league, player.espn_id)]);
  const row = log.find((r) => r.game_espn_id === id);
  if (!row) return null;

  const profile = buildStagedProfile(sport, log, reportedGames, espnSeasons).regular;
  const stats = performanceLine(sport, row, profile);
  const isHomeTeam = row.team_espn_id === game.home_team_espn_id;
  const teamColor = isHomeTeam ? game.home_color : game.away_color;

  return { league, game, player, row, profile, sport, stats, teamColor, isHomeTeam };
}

// The single place that maps loaded data onto PerformanceCard's props — the card route and the new
// page's opengraph-image both call this, so there is exactly one render path, never two to drift.
export function buildPerformanceCardElement(data: PerformanceCardData): ReactElement {
  const { league, game, player, row, stats, teamColor, isHomeTeam } = data;
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
