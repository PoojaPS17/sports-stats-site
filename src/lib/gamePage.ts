// The wording and section choices of a game's own page that depend on whether the game is still to come, being
// played, finished or called off. Pure, so tests need no React and no database. A game ESPN closed without playing
// (postponed, cancelled, abandoned, suspended) must not read like a preview of a match that will be played: no
// "pre-match win probability", no "going into this game", no season averages "coming into" it, no broadcast slot.
import { gameCalledOffLabel, isGameCalledOff, isNeverPlayed } from "./gameStatus";
import { isCricketLeague, isFirstClassCricket, isSoccerLeague, LEAGUE_LABEL, type League } from "./leagues";
import { teamDisplayName } from "./teamName";

interface Status {
  completed: boolean;
  status_state: string | null;
  status_detail: string | null;
}

/** "Chelsea at Arsenal" order: the NFL and NBA name the visitors first, football and cricket the home side first. */
export function gameSides(league: League, game: { home_name: string; away_name: string }): { first: string; second: string; awayFirst: boolean } {
  const awayFirst = league === "nfl" || league === "nba";
  return awayFirst ? { first: game.away_name, second: game.home_name, awayFirst } : { first: game.home_name, second: game.away_name, awayFirst };
}

/** Why a game is off in a sentence: "postponed", "cancelled", "abandoned" or "suspended"; null for any other game. */
const offWord = (game: Status): string | null => gameCalledOffLabel(game)?.toLowerCase() ?? null;

/** The US leagues say "game"; football and cricket say "match", as the rest of their copy does. */
const noun = (league: League): string => (league === "nfl" || league === "nba" ? "game" : "match");

/**
 * True for a game that was never played: postponed or cancelled. An abandoned or suspended game may have been
 * part played and still has its own line-ups, leaders and box score, so it is not "never played".
 */
const neverPlayed = (game: Status): boolean => isGameCalledOff(game) && isNeverPlayed(game.status_detail);

/**
 * The meta description of a game page. `where` is " at <venue>" or ""; `scorers` is the soccer goals line (with its
 * leading space) or "". A called-off game says it was called off and keeps the parts that stay true (form and
 * head-to-head); a finished cricket match reports its result, including "Match abandoned without a ball bowled".
 */
export function gameDescription(league: League, game: Status & { status_summary: string | null; home_name: string; away_name: string }, date: string, where: string, scorers = ""): string {
  const { first, second, awayFirst } = gameSides(league, game);
  const off = offWord(game);
  const cricket = isCricketLeague(league);
  const result = game.completed && game.status_summary ? ` ${teamDisplayName(game.status_summary)}.` : "";
  // A Test's two-innings score line is too long for a title; the description carries the result.
  if (isFirstClassCricket(league)) {
    const state = off ? ` This ${noun(league)} was ${off}.` : result;
    const covers = off ? "Head-to-head record." : "Full scorecard of all four innings and head-to-head.";
    return `${teamDisplayName(first)} v ${teamDisplayName(second)}${where}, ${date}.${state} ${covers}`;
  }
  const covers = cricket ? "Scorecard and head-to-head." : isSoccerLeague(league) ? "Line-ups, timeline, team stats, box score and head-to-head." : "Scoring summary, win probability, team stats, box score and head-to-head.";
  let extras: string;
  if (off) extras = ` This ${noun(league)} was ${off}. ${cricket ? "Head-to-head record and recent form." : "Team form and head-to-head record."}`;
  else if (game.completed) extras = `${cricket ? result : scorers} ${covers}`;
  else extras = cricket ? " Head-to-head record and recent form." : " Team form, head-to-head record and pre-match win probability.";
  return `${LEAGUE_LABEL[league]}: ${teamDisplayName(first)} ${awayFirst ? "at" : "v"} ${teamDisplayName(second)}${where}, ${date}.${extras}`;
}

/**
 * How the two teams' stat comparison is introduced. Before a game starts ESPN's "boxscore" is each team's season
 * averages, and it keeps sending those for a game it closed without playing, so a fixture and a called-off game
 * both get the season comparison, each with wording that is true for it; only a live or finished game has a real
 * "Team Stats" box score.
 */
export function teamStatsFraming(league: League, game: Status): {
  seasonAverages: boolean;
  heading: string;
  description: string | undefined;
  cardTitle: string;
  shareLabel: string;
} {
  const off = offWord(game);
  // Season averages only where there is no play to report: a game not yet started, or one never played. An
  // abandoned or suspended game that reached state post has its real (partial) box score.
  const seasonAverages = neverPlayed(game) || game.status_state === "pre";
  if (!seasonAverages) return { seasonAverages, heading: "Team Stats", description: undefined, cardTitle: "Team stats", shareLabel: "team stats" };
  return {
    seasonAverages,
    heading: "Season Comparison",
    description: off ? `Season averages for both teams. This ${noun(league)} was ${off}.` : "Season averages coming into this game. It hasn't been played yet.",
    cardTitle: "Season comparison",
    shareLabel: "season comparison",
  };
}

/** True when there is something to compare: a team-stats section over two empty lists is a heading with nothing under it. */
export function hasTeamStats(away: { stats: unknown[] } | undefined, home: { stats: unknown[] } | undefined): boolean {
  return !!away && !!home && (away.stats.length > 0 || home.stats.length > 0);
}

/**
 * The "Going in" / "Before and after" card: its heading, whether it may show the Elo win probability, and its row
 * labels. A called-off game keeps ratings and form (true whatever happens) but has no probability, since the game
 * will not be played as this event, and nothing in its wording promises a match.
 */
export function matchContextView(league: League, game: Status): {
  title: string;
  description: string;
  showProbability: boolean;
  labels: { elo: string; form: string; standing: string };
} {
  const soccer = isSoccerLeague(league);
  const off = offWord(game);
  if (off) {
    return {
      title: "Ratings and form",
      description: `This ${noun(league)} was ${off}. Ratings and form as of the scheduled date, from every result on record.`,
      showProbability: false,
      labels: { elo: "Elo rating", form: "Recent form", standing: soccer ? "Position" : "Record" },
    };
  }
  return game.completed
    ? {
        title: "Before and after",
        description: "Ratings, form and standing before and after this game, from every result on record.",
        showProbability: true,
        labels: { elo: "Elo rating (change)", form: "Form going in", standing: soccer ? "Table position" : "Record" },
      }
    : {
        title: "Going in",
        description: "Ratings and form going into this game, from every result on record.",
        showProbability: true,
        labels: { elo: "Elo rating", form: "Form going in", standing: soccer ? "Position" : "Record going in" },
      };
}

/**
 * Which parts of a game page may show. ESPN's details for a game that was never played (postponed or cancelled)
 * carry the original slot's broadcast and forecast, and season leaders, squad lists or empty lists where a game's
 * own would be; none of it is this game's play, so those games hide it. An abandoned or suspended game may have
 * real partial play, so it keeps every play section (each still renders only when it has data); only the
 * broadcast and forecast, which belong to the original slot, are hidden for any called-off game.
 */
export function gameSections(game: Status): {
  broadcastStrip: boolean;
  winProbability: boolean;
  lineups: boolean;
  leaders: boolean;
  playerStats: boolean;
  /** Officials, attendance and score by period: the parts of the facts strip that come from a game being played. The venue stays. */
  playFacts: boolean;
  detailsMissingNote: boolean;
} {
  const play = !neverPlayed(game);
  return { broadcastStrip: offWord(game) === null, winProbability: play, lineups: play, leaders: play, playerStats: play, playFacts: play, detailsMissingNote: play };
}
