// Copy for the NFL player pages, which show ESPN's games played but total stats from the box scores.

const NFL_REGULAR_SEASON_ESPN_NOTE =
  "Games played is ESPN's figure. Stat totals come from the box scores of games with a recorded stat line, so a player who played without a stat line (a lineman, a special-teams player) has fewer games in the log than in the season.";
const NFL_REGULAR_SEASON_LOGGED_NOTE =
  "Games are those with a recorded stat line; ESPN's games-played figure is not stored for this player. Stat totals come from the same box scores.";

/** The regular-season section note; it only says the games are ESPN's when at least one listed season has ESPN's figure. */
export const nflRegularSeasonNote = (gamesFromEspn: boolean): string => (gamesFromEspn ? NFL_REGULAR_SEASON_ESPN_NOTE : NFL_REGULAR_SEASON_LOGGED_NOTE);

export const NFL_PLAYOFFS_NOTE = "Playoff games only; ESPN lists these separately from the regular season. Counts are games with a recorded stat line.";
