// Copy for the NFL player pages, which show ESPN's games played but total stats from the box scores, and for the
// NBA player pages, where ESPN's box scores have no stat line for some games.
import type { GamesSource } from "./playerProfile";

const NFL_REGULAR_SEASON_ESPN_NOTE =
  "Games played is ESPN's figure. Stat totals come from the box scores of games with a recorded stat line, so a player who played without a stat line (a lineman, a special-teams player) has fewer games in the log than in the season.";
const NFL_REGULAR_SEASON_LOGGED_NOTE =
  "Games are those with a recorded stat line; ESPN's games-played figure is not stored for this player. Stat totals come from the same box scores.";

/** The regular-season section note; it only says the games are ESPN's when at least one listed season has ESPN's figure. */
export const nflRegularSeasonNote = (gamesFromEspn: boolean): string => (gamesFromEspn ? NFL_REGULAR_SEASON_ESPN_NOTE : NFL_REGULAR_SEASON_LOGGED_NOTE);

export const NFL_PLAYOFFS_NOTE = "Playoff games only; ESPN lists these separately from the regular season. Counts are games with a recorded stat line.";

/** Added to an NBA section description when its GP includes games with no box score (marked † in the tables). */
export const NBA_NO_BOX_SCORE_NOTE =
  "† ESPN's box scores have no stat line for some of this player's games. For those seasons the games, per-game averages and percentages are ESPN's own season figures where ESPN stores them (W-L is left blank). The game log, best games, splits and milestones below count only games with a box score.";

/** The same note for a Playoffs or Play-In table, where GP is always counted from the rosters (ESPN's stored figure is regular season only). */
export const NBA_NO_BOX_SCORE_STAGE_NOTE =
  "ESPN's box scores have no stat line for some of this player's games. Those games are counted from the game rosters toward GP but not toward the per-game averages, the game log or the best games, and W-L is left blank for those seasons.";

/** A section description, with the no-box-score note after it when `n` of its games have none. */
export function withNoBoxScoreNote(text: string, n: number, stage: "regular" | "other"): string {
  if (n <= 0) return text;
  return `${text} ${stage === "regular" ? NBA_NO_BOX_SCORE_NOTE : NBA_NO_BOX_SCORE_STAGE_NOTE}`;
}

/** Added to a section that is built from game rows (best games, splits, opponents, milestones, form). */
export const BOX_ROWS_ONLY_NOTE = "Counts only games with a box score.";

/** A section description, with the box-rows note after it when `n` of the player's games have no box score. */
export const withBoxRowsNote = (text: string, n: number): string => (n <= 0 ? text : `${text} ${BOX_ROWS_ONLY_NOTE}`);

/** The line under the downloadable card's numbers when its GP carries the † (see `careerStripStats`). `boxOnlyShort`
 * is the seasons still built from box rows although ESPN counts more games; when there are none, every season short
 * of games shows ESPN's own line. */
export const nbaCardNote = (boxOnlyShort: number): string =>
  boxOnlyShort === 0
    ? "† Includes games without a box score; the figures are ESPN's season figures."
    : "† Includes games without a box score; some seasons' averages count only games with a box score.";

/** The regular-season footnote at the foot of the player page when a season is shown from ESPN's line. */
export const nbaEspnLineFootnote = (boxOnlyShort: number): string =>
  `Seasons where ESPN's box scores lack some games show ESPN's own season figures. The game log, best games, splits and milestones count only games with a box score.${
    boxOnlyShort > 0 ? " Where ESPN's season figures are not stored, per-game averages count only games with a box score." : ""
  }`;

/** The GS column's tooltip in a table that has a † season: GS is a count, so it follows the season's line too. */
export const nbaGamesStartedTitle = (espnLine: boolean): string =>
  espnLine
    ? "Games started. For a season shown from ESPN's season figures this is ESPN's count; for other seasons it counts only games with a box score."
    : "Games started, counted only in games with a box score.";

/** "82 games, 27.1 points, ..." for a meta description; just the games when there are no figures to quote
 * (every one of the player's games has no box score, so each average would be a dash). */
export const gamesAndFigures = (gamesText: string, figures: string | null): string => (figures ? `${gamesText}, ${figures}` : gamesText);

const games = (n: number): string => `${n} ${n === 1 ? "game" : "games"}`;

/** The tooltip on a † GP: how many of its games have no box score, and whether ESPN's own figure is behind the count. */
export function noBoxScoreGamesTitle(n: number, source: GamesSource): string {
  if (source === "espn") return `Includes ${games(n)} without a box score.`;
  return `Includes ${games(n)} without a box score, counted from the game rosters; ESPN's own games-played figure is not stored for this season.`;
}

/** The game log's line when games with no box score are missing from it. */
export const unlistedGamesNote = (n: number): string => `${games(n)} without a box score ${n === 1 ? "is" : "are"} not listed.`;
