// The pure half of the audit's independent check of an NBA season the site shows from ESPN's own season row:
// read ESPN's athlete game log (`.../athletes/{id}/gamelog?season={season}`), count the games the player
// played and sum their points, and set that against the same row's GP and PTS. Nothing here calls ESPN;
// the fetch lives in scripts/audit-player-totals.ts, so the tests can import this freely.

/** The regular-season games played and points scored that a game-log payload lists. */
export interface GamelogSeason {
  games: number;
  points: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A game with a numeric minutes cell was played (a decimal counts, and so does "0": ESPN counts a sub-minute
 * appearance in GP); "--" is a game on the bench sheet the player did not play in. */
function playedMinutes(cell: unknown): boolean {
  if (typeof cell === "number") return Number.isFinite(cell);
  return typeof cell === "string" && /^\d+(\.\d+)?$/.test(cell.trim());
}

/** A points cell as a number; a played game whose points are blank (the site reads it the same way) scored none. */
function pointsOf(cell: unknown): number {
  const n = typeof cell === "number" ? cell : typeof cell === "string" ? Number(cell.trim().replace(/,/g, "")) : NaN;
  return Number.isFinite(n) ? n : 0;
}

/** True for the All-Star Game: ESPN's game log lists it in its "Regular Season" group, and the event object in the
 * payload's `events` map (keyed by event id) carries `team.isAllStar: true` (and `eventNote: "NBA ALL-STAR GAME"`).
 * An event with no matching entry, or with no such flag, is an ordinary game. */
function isAllStarEvent(events: unknown, eventId: unknown): boolean {
  if (!isRecord(events) || typeof eventId !== "string") return false;
  const info = events[eventId];
  return isRecord(info) && isRecord(info.team) && info.team.isAllStar === true;
}

/** The regular-season games played and points of an ESPN athlete game-log payload: `names` names the columns
 * of every event's `stats`, and only the `seasonTypes` group whose `displayName` contains "Regular" counts
 * (the playoffs, play-in and preseason are other groups). An event is a played game only when its `minutes`
 * cell is a number, and the All-Star Game, which ESPN lists in the regular season but neither its own season
 * row nor the site counts, is dropped (`isAllStarEvent`). Null when the payload is not a game log with both a
 * `minutes` and a `points` column, so a failed or changed response is never read as a season with no games; a
 * game log with those columns and no regular-season group is 0 games and 0 points, and so is the bare
 * `{ filters: [...] }` payload ESPN answers with for a season it has no game log for (its box scores are blank
 * for the Bulls' and Pelicans' 2015-2018 games): that record has no `names`, `seasonTypes` or `events` at all. */
export function gamelogRegularSeason(payload: unknown): GamelogSeason | null {
  if (isRecord(payload) && Array.isArray(payload.filters) && Object.keys(payload).length === 1) return { games: 0, points: 0 };
  if (!isRecord(payload) || !Array.isArray(payload.names)) return null;
  const minutesAt = payload.names.indexOf("minutes");
  const pointsAt = payload.names.indexOf("points");
  if (minutesAt === -1 || pointsAt === -1) return null;
  let games = 0;
  let points = 0;
  const seasonTypes = Array.isArray(payload.seasonTypes) ? payload.seasonTypes : [];
  for (const seasonType of seasonTypes) {
    if (!isRecord(seasonType) || typeof seasonType.displayName !== "string" || !seasonType.displayName.includes("Regular")) continue;
    for (const category of Array.isArray(seasonType.categories) ? seasonType.categories : []) {
      if (!isRecord(category) || !Array.isArray(category.events)) continue;
      for (const event of category.events) {
        // An event whose stats stop short of either column is malformed, not a game with blank cells.
        if (!isRecord(event) || !Array.isArray(event.stats) || event.stats.length <= Math.max(minutesAt, pointsAt) || !playedMinutes(event.stats[minutesAt])) continue;
        if (isAllStarEvent(payload.events, event.eventId)) continue;
        games += 1;
        points += pointsOf(event.stats[pointsAt]);
      }
    }
  }
  return { games, points };
}

/** Whether a run that found ESPN with no game log for some seasons has in fact read none: it checked at least one
 * season and not one had regular-season games (`checked` counts the logs with games, `empty` those without). A few
 * empty logs are ESPN's own gap (the Bulls' and Pelicans' 2015-2018 seasons) and never fail the run; every log
 * empty is a wholesale change on ESPN's side, which must not read as a clean audit. */
export function gamelogNotReadAtAll(checked: number, empty: number): boolean {
  return checked === 0 && empty > 0;
}

/** The most games the game log and ESPN's season row may differ by and still be ESPN disagreeing with itself. */
export const MAX_INTERNAL_GAMES = 3;

/** The most points one NBA game can hold (the record is 100): what a game the two sources count differently
 * could account for at most. */
export const MAX_GAME_POINTS = 100;

export type GamelogVerdict = "confirmed" | "ESPN internal" | "log incomplete" | "MISMATCH";

/** Sets ESPN's game log against the season row it was fetched to check, first match wins:
 *   MISMATCH       a log with no games against a row with games (an empty log checks nothing; the caller treats
 *                  it as unreadable, this is the defence in depth)
 *   confirmed      the log's games equal the row's GP and its points equal the row's PTS
 *   ESPN internal  the games differ by 1 to MAX_INTERNAL_GAMES and the points differ by what those games could
 *                  hold: the side with more games has at least as many points, and at most MAX_GAME_POINTS a
 *                  game more (the parser drops the All-Star Game ESPN's game log lists in its regular season; the
 *                  NBA Cup final can still appear there and its season row does not count it, and ESPN
 *                  disagrees with itself in a few other games, for instance a game whose box score is blank)
 *   log incomplete the row has more than MAX_INTERNAL_GAMES games more than the log and the log's points do not
 *                  exceed the row's: the log can only be missing games (ESPN's game log has none for some
 *                  seasons, for instance the Bulls' and Pelicans' 2015-2018 games) and the row cannot be
 *                  checked further; listed, not a failure
 *   MISMATCH       anything else: the same games with different points, a log with more than
 *                  MAX_INTERNAL_GAMES more games than the row, or points the differing games cannot account for */
export function classifyGamelog(gamelog: GamelogSeason, espn: { games: number; pts: number }): GamelogVerdict {
  if (gamelog.games === 0 && espn.games > 0) return "MISMATCH";
  const gameDifference = gamelog.games - espn.games;
  const pointDifference = gamelog.points - espn.pts;
  if (gameDifference === 0 && pointDifference === 0) return "confirmed";
  const apart = Math.abs(gameDifference);
  if (apart >= 1 && apart <= MAX_INTERNAL_GAMES) {
    // The points the games only one side counts hold, seen from the side that has the extra games.
    const extra = gameDifference > 0 ? pointDifference : -pointDifference;
    if (extra >= 0 && extra <= apart * MAX_GAME_POINTS) return "ESPN internal";
  }
  if (-gameDifference > MAX_INTERNAL_GAMES && pointDifference <= 0) return "log incomplete";
  return "MISMATCH";
}
