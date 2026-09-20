// Copy for the NFL player pages, which show ESPN's games played but total stats from the box scores, and for the
// NBA player pages, where ESPN published no box score for every game of some seasons.
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
  "ESPN published no box score for some of this player's games. Those games count toward GP (ESPN's own figure where it is stored) but not toward the per-game averages, the game log or the best games, and W-L is left blank for those seasons. Any season averages ESPN publishes are shown as ESPN reports them.";

/** The same note for a Playoffs or Play-In table, where GP is always counted from the rosters (ESPN's stored figure is regular season only). */
export const NBA_NO_BOX_SCORE_STAGE_NOTE =
  "ESPN published no box score for some of this player's games. Those games are counted from the game rosters toward GP but not toward the per-game averages, the game log or the best games, and W-L is left blank for those seasons.";

/** A section description, with the no-box-score note after it when `n` of its games have none. */
export function withNoBoxScoreNote(text: string, n: number, stage: "regular" | "other"): string {
  if (n <= 0) return text;
  return `${text} ${stage === "regular" ? NBA_NO_BOX_SCORE_NOTE : NBA_NO_BOX_SCORE_STAGE_NOTE}`;
}

/** The line under the downloadable card's numbers when its GP carries the † (see `careerStripStats`). */
export const NBA_NO_BOX_SCORE_CARD_NOTE = "† Includes games ESPN published no box score for.";

/** "82 games, 27.1 points, ..." for a meta description; just the games when there are no figures to quote
 * (every one of the player's games has no box score, so each average would be a dash). */
export const gamesAndFigures = (gamesText: string, figures: string | null): string => (figures ? `${gamesText}, ${figures}` : gamesText);

const games = (n: number): string => `${n} ${n === 1 ? "game" : "games"}`;

/** The tooltip on a † GP: how many of its games have no box score, and whether ESPN's own figure is behind the count. */
export function noBoxScoreGamesTitle(n: number, source: GamesSource): string {
  if (source === "espn") return `Includes ${games(n)} ESPN published no box score for.`;
  return `Includes ${games(n)} ESPN published no box score for, counted from the game rosters; ESPN's own games-played figure is not stored for this season.`;
}

/** The game log's line when games with no box score are missing from it. */
export const unlistedGamesNote = (n: number): string => `${games(n)} ESPN published no box score for ${n === 1 ? "is" : "are"} not listed.`;
