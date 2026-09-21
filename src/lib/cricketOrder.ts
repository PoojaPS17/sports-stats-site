// Which side of a cricket match batted first. Cricinfo lists that side first in a score line;
// the site's cards list the away side first for every sport. The order is read from what is stored:
//
//   - the match report's scorecard, when there is one. ESPN's carries one entry per team, with each
//     batting row (and each innings total) numbered by the match innings; Cricsheet's carries one
//     entry per innings in match order, with no numbers;
//   - otherwise, for a limited-overs match, the two score lines: only the side that batted second
//     carries "target" ("151/1 (15.3/20 ov, target 148)"). Not used for first-class cricket, where a
//     follow-on lets one side bat first and last.
//
// Pure, so cards, pages and tests share it. Returns null when nothing says.
import type { CricketTeamScorecard } from "./matchDetail";
import type { GameRow } from "./queries";
import { isFirstClassCricket, isCricketLeague } from "./leagues";

/** The id of the team that batted first, from a stored scorecard; null when the scorecard cannot say. */
export function battingFirstTeamId(scorecard: CricketTeamScorecard[] | null | undefined): string | null {
  if (!scorecard || scorecard.length === 0) return null;
  let best: { teamId: string; innings: number } | null = null;
  const consider = (teamId: unknown, innings: number | undefined) => {
    if (teamId == null || !Number.isFinite(innings) || (innings ?? 0) <= 0) return;
    if (!best || innings! < best.innings) best = { teamId: String(teamId), innings: innings! };
  };
  for (const entry of scorecard) {
    for (const total of entry.innings ?? []) consider(entry.teamId, total.period);
    for (const row of entry.battingRows ?? []) consider(entry.teamId, row.innings);
  }
  if (best) return (best as { teamId: string }).teamId;
  // No innings numbers anywhere: a scorecard that lists one entry per innings, in the order they were played.
  return scorecard[0].battingRows?.length ? String(scorecard[0].teamId) : null;
}

type Sides = Pick<GameRow, "league" | "home_team_espn_id" | "away_team_espn_id" | "home_score_display" | "away_score_display">;

/** "home" or "away" for the side that batted first, or null when it cannot be told. */
export function battingFirstSide(game: Sides, scorecard?: CricketTeamScorecard[] | null): "home" | "away" | null {
  if (!isCricketLeague(game.league)) return null;
  const id = battingFirstTeamId(scorecard);
  if (id != null) {
    if (id === String(game.home_team_espn_id)) return "home";
    if (id === String(game.away_team_espn_id)) return "away";
  }
  if (isFirstClassCricket(game.league)) return null;
  const chased = (display: string | null) => (display ? /\btarget\b/i.test(display) : false);
  const homeChased = chased(game.home_score_display);
  const awayChased = chased(game.away_score_display);
  if (homeChased && !awayChased) return "away";
  if (awayChased && !homeChased) return "home";
  return null;
}

/**
 * The order a cricket score line lists its two sides in: the side that batted first goes first. Every
 * other sport, and a cricket match whose order cannot be told, keeps the usual away-then-home order.
 */
export function scoreLineOrder(game: Sides, scorecard?: CricketTeamScorecard[] | null): ["away", "home"] | ["home", "away"] {
  return battingFirstSide(game, scorecard) === "home" ? ["home", "away"] : ["away", "home"];
}
