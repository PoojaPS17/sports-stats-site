// Text and state a game's visitor-facing displays share. A game ESPN closed without playing is stored as not
// completed with a called-off status; it must never read as a fixture still to come, so every "upcoming" test and
// kickoff time goes through here.
import type { GameRow } from "./queries";
import { dayTimeZone, dayZoneLabel, formatGameDate, formatGameTime, gameDayIso } from "./gameDay";
import type { CricketTeamScorecard } from "./matchDetail";
import { gameCalledOffLabel, isGameCalledOff, isTimeTbd } from "./gameStatus";
import { isCricketLeague, LEAGUE_LABEL } from "./leagues";
import { teamDisplayName } from "./teamName";
import { finishedLabel, finishedPillLabel, normalizeStage, overtimeFinal } from "./stage";
import { scoreLineHomeFirst, scoreLineSides } from "./gamePage";
import type { League } from "./leagues";

type StatusFields = Pick<GameRow, "completed" | "status_state" | "status_detail">;
type StageFields = Pick<GameRow, "round" | "stage" | "competition_type" | "note">;

/** A game still to be played: not finished, not in play, and not called off. */
export const isUpcomingGame = (g: StatusFields): boolean => !g.completed && g.status_state !== "in" && !isGameCalledOff(g);

/**
 * The date line of a schedule row: date and kickoff for an upcoming game, date and reason for a
 * called-off one, date alone otherwise. The date is the league's own calendar day (Eastern for the
 * NFL and NBA), and the kickoff is read in that same zone so the two agree rather than showing a UTC
 * time under an Eastern date. The wording is unchanged: only the zone the two are read in moved.
 */
export function scheduleRowHeading(league: League, g: StatusFields & Pick<GameRow, "date" | "local_date">): string {
  const when = formatGameDate(g.date, league, { weekday: "short", month: "short", day: "numeric" }, g.local_date);
  const off = gameCalledOffLabel(g);
  if (off) return `${when} · ${off}`;
  if (isUpcomingGame(g)) {
    // A fixture with no kickoff time yet has a day and "TBD": the feed's placeholder clock time would read as a real one.
    if (isTimeTbd(g)) return `${when} · TBD`;
    // A US game's kickoff names its zone (the card's footer says UTC, which a bare clock time would invite reading as UTC too);
    // every other league keeps its wording exactly.
    const zone = dayTimeZone(league) === "UTC" ? "" : ` ${dayZoneLabel(league)}`;
    return `${when} · ${formatGameTime(g.date, league, { hour: "numeric", minute: "2-digit" })}${zone}`;
  }
  return when;
}

/** Screen-reader name of a game card. Football names the home side first ("Arsenal v Chelsea"), the US leagues the visitors ("Chelsea at Arsenal"). */
export function gameAccessibleLabel(
  league: League,
  game: StatusFields & StageFields & Pick<GameRow, "date" | "local_date" | "home_name" | "away_name" | "home_score" | "away_score" | "home_score_display" | "away_score_display">,
): string {
  const off = gameCalledOffLabel(game);
  const homeFirst = scoreLineHomeFirst(league);
  const home = teamDisplayName(game.home_name);
  const away = teamDisplayName(game.away_name);
  if (game.completed && !off) {
    const homeScore = game.home_score_display ?? game.home_score ?? "";
    const awayScore = game.away_score_display ?? game.away_score ?? "";
    const line = homeFirst ? `${home} ${homeScore}, ${away} ${awayScore}` : `${away} ${awayScore}, ${home} ${homeScore}`;
    // A stage label replaces the plain word, so "final" follows it: the name always says the game is over
    // ("..., NBA Cup · Group play, final"). A label that already ends in it is left alone: "Final", "Semi-Final",
    // "NBA Cup final" and overtime ("Final/OT", "Play-In · Final/2OT") would otherwise read "Final, final".
    const label = finishedPillLabel(league, game, "final");
    return `${line}, ${/final(\/\d*OT)?$/i.test(label) ? label : `${label}, final`}`;
  }
  // The day the match is filed under (cricket's local date where there is one), and football's home-first order.
  const date = formatGameDate(game.date, league, { weekday: "long", month: "long", day: "numeric" }, game.local_date);
  const label = homeFirst ? `${home} v ${away}, ${date}` : `${away} at ${home}, ${date}`;
  return off ? `${label}, ${off.toLowerCase()}` : label;
}

/** The status line of one tile on a scoreboard image: result, live detail, kickoff (in the league's day zone, labelled), or why a called-off game is off. */
export function scoreboardTileStatus(league: League, g: StatusFields & StageFields & Pick<GameRow, "date" | "local_date">, withDate: boolean): string {
  const off = gameCalledOffLabel(g);
  const live = g.status_state === "in" && !g.completed;
  if (withDate) {
    const day = formatGameDate(g.date, league, { month: "short", day: "numeric", year: "numeric" }, g.local_date);
    return `${day} · ${off ?? (g.completed ? finishedPillLabel(league, g) : live ? (g.status_detail ?? "Live") : "Upcoming")}`;
  }
  if (off) return off;
  if (g.completed) return finishedPillLabel(league, g);
  if (live) return g.status_detail ?? "Live";
  // No kickoff time set yet: the tile's date says which day, and a placeholder clock time would be wrong.
  if (isTimeTbd(g)) return "TBD";
  return `${new Date(g.date).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: dayTimeZone(league) })} ${dayZoneLabel(league)}`;
}

/**
 * How a finished match that has no scores ended ("Match abandoned without a ball bowled", "No result"): the
 * result text ESPN gives, for the share image to show in place of "vs". It is a result, never a called-off label.
 */
export function finishedNoScoreNote(g: Pick<GameRow, "completed" | "home_score" | "away_score" | "status_summary">): string | null {
  if (!g.completed || (g.home_score != null && g.away_score != null)) return null;
  return g.status_summary?.trim() || null;
}

/**
 * The meta description of the scores-by-date page. Only finished games count as played; a called-off game is
 * listed on the page with its pill but is mentioned as postponed, cancelled or called off, never counted as played
 * or described as having a final score; games still to come are not counted either.
 */
export function scoresDayDescription(league: League, dayLabel: string, games: (StatusFields & Pick<GameRow, "home_score" | "away_score">)[]): string {
  const label = LEAGUE_LABEL[league];
  const american = league === "nba" || league === "nfl";
  const noun = american ? "game" : "match";
  const nouns = american ? "games" : "matches";
  const finished = games.filter((g) => g.completed && !isGameCalledOff(g)).length;
  const off = games.map(gameCalledOffLabel).filter((l): l is string => l !== null);
  const toPlay = games.length - finished - off.length;
  const inPlay = games.filter((g) => !g.completed && g.status_state === "in").length;
  // A finished match with no scores (abandoned, no result) has a result but no final score to promise.
  const unscored = games.some((g) => g.completed && !isGameCalledOff(g) && (g.home_score == null || g.away_score == null));
  const links = american ? "box score" : isCricketLeague(league) ? "scorecard" : "match report";

  let text: string;
  if (finished > 0) {
    const count = finished === games.length ? (finished === 1 ? "The one" : `All ${finished}`) : String(finished);
    text = `${count} ${label} ${finished === 1 ? noun : nouns} played on ${dayLabel}, with ${unscored ? "results" : "final scores"} and a link to each ${links}.`;
  } else if (toPlay > 0) {
    const when = inPlay === toPlay ? "in play" : inPlay > 0 ? "in play or to be played" : "to be played";
    text = `${toPlay} ${label} ${toPlay === 1 ? noun : nouns} ${when} on ${dayLabel}, with scores as they finish.`;
  } else {
    text = `No ${label} ${nouns} were played on ${dayLabel}.`;
  }
  if (off.length > 0) {
    const reason = new Set(off).size === 1 ? off[0].toLowerCase() : "called off";
    text += ` ${off.length} ${off.length === 1 ? noun : nouns} ${off.length === 1 ? "was" : "were"} ${reason}.`;
  }
  return text;
}

/**
 * The status word over a game's share image: the reason for a called-off game, "Final" (or "Final/OT") for a scored result,
 * "Result" for a finished match with no scores (abandoned, no result), null for a fixture or a game in play.
 * A finished cricket match is never "Final" unless it is the final: it says its stage when it has one
 * ("Qualifier 1", "Final") and "Result" otherwise, as the match header does. `league` is required so a caller
 * cannot forget it and put "Final" back on a cricket match.
 */
export function shareImageStatus(g: StatusFields & Pick<GameRow, "home_score" | "away_score" | "status_summary"> & { round?: string | null }, league: League): string | null {
  const off = gameCalledOffLabel(g);
  if (off) return off;
  if (!g.completed) return null;
  // Cricket says its stage ("Final" only for the final) or "Result"; the other sports keep "Final", and "Final/OT"
  // where the stored status says the game went to overtime.
  if (isCricketLeague(league)) return normalizeStage(g.round) ?? finishedLabel(league);
  return finishedNoScoreNote(g) ? "Result" : (overtimeFinal(g.status_detail) ?? "Final");
}

/**
 * What a match's share image decides beyond its layout: the status word and the order of the two sides
 * (the batting-first side first for cricket, from the stored scorecard when the route has it, else the
 * score lines; away then home for every other sport). The image route calls this and nothing else for
 * either, so it can be tested without rendering an image.
 */
export function shareImageModel(game: GameRow, scorecard?: CricketTeamScorecard[] | null): { status: string | null; order: ["away", "home"] | ["home", "away"] } {
  return { status: shareImageStatus(game, game.league), order: scoreLineSides(game.league, game, scorecard) };
}

/**
 * The day a scores share image is filed under: its ISO day (the file name) and year (the subtitle), read
 * from the first game's local date when it has one, so a 1 January local match that is 31 December in
 * UTC is a January file of the new year. The league page calls this for each day's image.
 */
export function scoresImageDay(league: League, first: Pick<GameRow, "date" | "local_date">): { iso: string; year: string } {
  const iso = gameDayIso(first.date, league, first.local_date);
  return { iso, year: iso.slice(0, 4) };
}
