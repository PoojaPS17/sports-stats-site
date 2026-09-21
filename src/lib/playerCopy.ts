// Copy for the NFL player pages, which show ESPN's games played but total stats from the box scores, and for the
// NBA player pages, where ESPN's box scores have no stat line for some games.
import type { GamesSource } from "./playerProfile";

const NFL_REGULAR_SEASON_ESPN_NOTE =
  "Games played is ESPN's figure. Stat totals come from the box scores of games with a recorded stat line, so a player who played without a stat line (a lineman, a special-teams player) has fewer games in the log than in the season.";
const NFL_REGULAR_SEASON_LOGGED_NOTE =
  "Games are those with a recorded stat line; ESPN's games-played figure is not stored for this player. Stat totals come from the same box scores.";

/** The regular-season note of a player whose seasons are all ESPN's stored games with no box-score row (`storedGamesOnly`). */
export const NFL_STORED_GAMES_NOTE = "Games played is ESPN's figure. The site has no box-score stat line for these games, so no stats are shown.";

/** Where the game log would be, for such a player. */
export const NFL_NO_GAME_LOG_NOTE = "No game-by-game box scores are on record for this player.";

/** The regular-season section note; it only says the games are ESPN's when at least one listed season has ESPN's figure.
 * `storedOnly`: every season is ESPN's stored games with no box-score row. */
export const nflRegularSeasonNote = (gamesFromEspn: boolean, storedOnly = false): string =>
  storedOnly ? NFL_STORED_GAMES_NOTE : gamesFromEspn ? NFL_REGULAR_SEASON_ESPN_NOTE : NFL_REGULAR_SEASON_LOGGED_NOTE;

export const NFL_PLAYOFFS_NOTE = "Playoff games only; ESPN lists these separately from the regular season. Counts are games with a recorded stat line.";

/** The lead of the strip and season notes; `scope` is "those seasons" on the player page and "this season" on a season page. */
const noBoxScoreLead = (scope: string): string =>
  `† ESPN's box scores have no stat line for some of this player's games. For ${scope} the games, per-game averages and percentages are ESPN's own season figures where the site can use ESPN's row for the season; otherwise the games count includes them and the per-game averages and percentages cover only games with a box score (W-L is left blank).`;

/** Added to the main player page's career strip description when its GP includes games with no box score (marked † in the tables). */
export const NBA_NO_BOX_SCORE_NOTE = `${noBoxScoreLead("those seasons")} The game log, best games and splits below count only games with a box score, as do the counts in Milestones.`;

/** The same note for a season page, which reads for one season and has a game log, best games and splits but no milestones. */
export const NBA_NO_BOX_SCORE_SEASON_NOTE = `${noBoxScoreLead("this season")} The game log, best games and splits below count only games with a box score.`;

/** The main page's season table description, where the long note above the strip is not repeated. */
export const NBA_NO_BOX_SCORE_TABLE_NOTE = "† marks seasons with games that have no box score; see the note above.";

/** The same note for a Playoffs or Play-In table, where GP is always counted from the rosters (ESPN's stored figure is regular season only). */
export const NBA_NO_BOX_SCORE_STAGE_NOTE =
  "ESPN's box scores have no stat line for some of this player's games. Those games are counted from the game rosters toward GP but not toward the per-game averages, the game log or the best games, and W-L is left blank for those seasons.";

/** A section description, with the no-box-score note after it when `n` of its games have none. `regular` is the main
 * page's strip note, `season` the season page's, `table` the pointer under the strip, `other` the playoffs and play-in. */
export function withNoBoxScoreNote(text: string, n: number, stage: "regular" | "season" | "table" | "other"): string {
  if (n <= 0) return text;
  const note = { regular: NBA_NO_BOX_SCORE_NOTE, season: NBA_NO_BOX_SCORE_SEASON_NOTE, table: NBA_NO_BOX_SCORE_TABLE_NOTE, other: NBA_NO_BOX_SCORE_STAGE_NOTE }[stage];
  return `${text} ${note}`;
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
    ? "† Includes games without a box score; the seasons short of a box score use ESPN's own season figures."
    : "† Includes games without a box score; some averages count only games with a box score.";

/** Added to the Milestones description: "First game on record" and the "Nth game" landmarks count every game played
 * (a game without a box score is still a game), so the generic `BOX_ROWS_ONLY_NOTE` would not be true here. */
export const NBA_MILESTONES_NOTE = "Game numbers count every game played; the counts of 30-point games, double-doubles and so on cover only games with a box score.";

/** A Milestones description, with its own note after it when `n` of the player's games have no box score. */
export const withMilestonesNote = (text: string, n: number): string => (n <= 0 ? text : `${text} ${NBA_MILESTONES_NOTE}`);

/** The regular-season footnote at the foot of the player page when some games have no box score. Both halves hold
 * whether or not a season is shown from ESPN's row. */
export const NBA_REGULAR_SEASON_FOOTNOTE =
  "Where the site can use ESPN's row for a season, that season's figures are ESPN's own; otherwise the games played include games without a box score and the per-game averages cover only games with a box score. The game log, best games and splits count only games with a box score, as do the counts in Milestones.";

/** The season page's section description: "every game" is not true when some of the season's games have no box score, and
 * "the games on record" is not true either when the season is shown from ESPN's own row, so the lead is neutral then. */
export const seasonFiguresText = (label: string, split: boolean, noBoxScore: number): string =>
  `${label}${split ? " regular-season" : ""} figures${noBoxScore > 0 ? "" : " from every game on record"}.`;

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
