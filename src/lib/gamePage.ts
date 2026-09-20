// The wording and section choices of a game's own page that depend on whether the game is still to come, being
// played, finished or called off. Pure, so tests need no React and no database. A game ESPN closed without playing
// (postponed, cancelled, abandoned, suspended) must not read like a preview of a match that will be played: no
// "pre-match win probability", no "going into this game", no season averages "coming into" it, no broadcast slot.
import { gameCalledOffLabel } from "./gameStatus";
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

const noun = (league: League): string => (isCricketLeague(league) ? "match" : "game");

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
export function teamStatsFraming(game: Status): {
  seasonAverages: boolean;
  heading: string;
  description: string | undefined;
  cardTitle: string;
  shareLabel: string;
} {
  const off = offWord(game);
  const seasonAverages = off !== null || game.status_state === "pre";
  if (!seasonAverages) return { seasonAverages, heading: "Team Stats", description: undefined, cardTitle: "Team stats", shareLabel: "team stats" };
  return {
    seasonAverages,
    heading: "Season Comparison",
    description: off ? `Season averages for both teams. This game was ${off}.` : "Season averages coming into this game. It hasn't been played yet.",
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
      description: `This game was ${off}. Ratings and form as of the scheduled date, from every result on record.`,
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
 * Which parts of a game page may show. ESPN's details for a game it closed without playing carry the original
 * slot's broadcast and forecast, and season leaders, squad lists or empty lists where a game's own would be; none
 * of it is this game's play, so a called-off game hides it all.
 */
export function gameSections(game: Status): {
  broadcastStrip: boolean;
  winProbability: boolean;
  lineups: boolean;
  leaders: boolean;
  playerStats: boolean;
  detailsMissingNote: boolean;
} {
  const show = offWord(game) === null;
  return { broadcastStrip: show, winProbability: show, lineups: show, leaders: show, playerStats: show, detailsMissingNote: show };
}
