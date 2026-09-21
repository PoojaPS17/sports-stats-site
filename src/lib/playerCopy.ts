// Copy for the NFL player pages, which show ESPN's games played but total stats from the box scores, and for the
// NBA player pages, where ESPN's box scores have no stat line for some games.
import { formatSeasonLabel, HISTORY_START, isSoccerLeague, LEAGUE_LABEL, type League } from "./leagues";
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

/** The same note for a Playoffs or Play-In table. ESPN's stored season row is regular season only, but ESPN has a postseason row
 * of its own (the playoffs, not the play-in); a season with games that have no box score shows it where it is stored, and
 * shows dashes where it is not, rather than an average over the games that do have a box score. */
export const NBA_NO_BOX_SCORE_STAGE_NOTE =
  "ESPN's box scores have no stat line for some of this player's games. Where ESPN's own postseason row is stored for a season, that season shows ESPN's figures; otherwise its games are counted from the game rosters toward GP and its averages are dashes, not an average over the games that have a box score. The game log and best games count only games with a box score, and W-L is left blank for those seasons.";

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

// ---------------------------------------------------------------------------
// What a player's totals cover. The site's box scores start at the league's HISTORY_START (NBA 2014-15, NFL 2015, the
// soccer leagues 2015-16), so a player's "career" here is the seasons since then, and every place that would say
// "Career" says "since <that season>" instead. One helper, so the wording cannot drift between the pages.
// ---------------------------------------------------------------------------
export interface CareerWording {
  /** The first season on the site, as the league labels it ("2014-15", "2015", "2015-16"); null for a league with no start. */
  since: string | null;
  /** The main page's totals header: "Regular season since 2014-15" (NBA, NFL, where the stages are separate) or "Since 2015-16". */
  heroTitle: string;
  /** The line under it, or null when there is nothing to disclose. */
  heroNote: string | null;
  /** The totals row of a season table. */
  seasonTotal: string;
  /** The totals row of the playoffs table and of the play-in table. */
  playoffsTotal: string;
  playinTotal: string;
  /** What the downloadable card's numbers cover ("NBA stats since 2014-15"). */
  cardContext: string;
  /** The compare page's line when no season is in play. */
  compareNote: string;
  /** The season page's link back to the player's page. */
  allSeasonsLabel: (name: string) => string;
}

/** `split` is true where the regular season, playoffs and play-in are separate tables (NBA, NFL). `firstSeason` is the first
 * season the player has on the site (ESPN's year), when the caller knows it: the note that these are not career totals then
 * shows only for a player whose record starts where the site's does (anyone whose first season is later has all of it here).
 * Left out, the note always shows. Only the leagues whose player pages total from box scores that begin at HISTORY_START (NBA,
 * NFL, soccer) say "since"; cricket totals are whole careers (Cricsheet, ESPN) and keep the plain wording. */
export function careerWording(league: League, split: boolean, firstSeason?: number | null): CareerWording {
  const boxScoreLeague = league === "nba" || league === "nfl" || isSoccerLeague(league);
  const since = boxScoreLeague ? formatSeasonLabel(league, HISTORY_START[league] ?? null) : null;
  const label = LEAGUE_LABEL[league];
  if (!since) {
    // A league with no box-score history start (cricket) keeps the plain wording.
    return {
      since: null,
      heroTitle: split ? "Career (regular season)" : "Career",
      heroNote: null,
      seasonTotal: "Career on record",
      playoffsTotal: "Career playoffs",
      playinTotal: "Career play-in",
      cardContext: "Career stats",
      compareNote: "Career figures on record",
      allSeasonsLabel: (name) => `${name} career`,
    };
  }
  return {
    since,
    heroTitle: split ? `Regular season since ${since}` : `Since ${since}`,
    heroNote: firstSeason !== undefined && firstSeason !== HISTORY_START[league] ? null : `Games before ${since} are not on this site, so these are not career totals.`,
    seasonTotal: `Total since ${since}`,
    playoffsTotal: `Playoffs since ${since}`,
    playinTotal: `Play-in since ${since}`,
    cardContext: `${label} stats since ${since}`,
    compareNote: `Totals since ${since}`,
    allSeasonsLabel: (name) => `${name}, all seasons on this site`,
  };
}

/** The line under the totals strip: the competition, the span of the seasons shown, and (when the first season shown is the
 * first on the site, so the player may have played earlier) that earlier seasons are not here. `firstSeason` is the first
 * season shown, in ESPN's year. Only a strip over several seasons says it: a single-season page ("2014-15") is one season,
 * and "earlier seasons" there would point at seasons that are on the site. */
export function careerStripSuffix(league: League, firstSeason: number | null, multiSeason: boolean): string {
  return multiSeason && firstSeason !== null && firstSeason === HISTORY_START[league] ? " Earlier seasons are not on this site." : "";
}

// Data notes: the limits of the source, said once where the figures appear.

/** The disclosure under an NFL player's figures. */
export const NFL_PLAYER_DATA_NOTE = "Figures are summed from ESPN box scores; ESPN occasionally leaves a stat unrecorded or uncorrected (for example a tackle credited to the wrong game).";

/** Under a soccer match's timeline, where the cards are. */
export const SOCCER_CARDS_NOTE = "Cards as reported by ESPN; occasional omissions.";

/** Under a team's "Current roster": ESPN's roster lags the league's own. The NBA's wording names camp and two-way signings
 * (measured against NBA.com); the NFL's is generic, since the lag is not measured there. Soccer gets none. */
export const ROSTER_SOURCE_NOTE = "Roster as listed by ESPN; camp and two-way signings appear when ESPN adds them.";
export const NFL_ROSTER_SOURCE_NOTE = "Roster as listed by ESPN; recent signings appear when ESPN adds them.";
export const rosterSourceNote = (league: League): string | undefined => (league === "nba" ? ROSTER_SOURCE_NOTE : league === "nfl" ? NFL_ROSTER_SOURCE_NOTE : undefined);
