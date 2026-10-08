// Which standings seasons are real, and which one is "now". Pure (no database) so the rules can be tested on their own.
//
// A `standings` row can exist for a season nobody has played, and the newest season on file is then not the current one:
//   - A season that is a copy of the last one. Once baseball's regular season ended, ESPN's standings feed said
//     `season.year: 2027` at its root while every table still carried 2026's final records, and the daily job filed
//     them under 2027 (MLB 2027 = MLB 2026, row for row, found 2026-10-08). The writer reads the table's own season now
//     (scripts/lib/standings.ts), but rows already stored stay, so the reader ignores them too: a season with
//     records, after the newest season that has a game on record, is a PHANTOM and does not exist for the site.
//   - A preseason table (NBA/NFL/MLB season type 1). Its records are exhibition games, so the table is shown labelled
//     Preseason with no positions or seeds, until a regular-season game exists (then ESPN's type flips to 2).
//   - A new season with every team 0-0. Not a phantom (nothing claims a result): the standings page already says
//     "the new season has not started yet" and falls back to the last season with games.
import type { League } from "./leagues";

/** The leagues whose games and standings carry ESPN's season type (games.season_type / standings.season_type). */
export const SEASON_TYPE_LEAGUES: League[] = ["nba", "nfl", "mlb"];
export const tracksSeasonType = (league: League): boolean => SEASON_TYPE_LEAGUES.includes(league);

/** ESPN's season type for a preseason (spring training in baseball). */
export const PRESEASON_TYPE = 1;

/** What the database knows about one standings season of a league. */
export interface SeasonFact {
  season: number;
  /** Wins + losses + draws over the season's rows: 0 for a table nobody has played in. */
  played: number;
  /** Some row's stored season type is the preseason one. */
  flaggedPreseason: boolean;
  /** Every row's season type is null (stored before the column existed, or a league that does not store it). */
  untyped: boolean;
  /** A completed game of this season is typed preseason. */
  hasPreseasonGames: boolean;
  /** A completed game of this season counts as a real one: not preseason, All-Star or the Cup final. */
  hasRealGames: boolean;
}

export interface SeasonStatus {
  season: number;
  played: number;
  preseason: boolean;
  phantom: boolean;
}

/**
 * Classifies a league's standings seasons (any order). `realThrough` is the newest season with a completed real game.
 * Preseason: the stored type says so or, on a row stored before the type was, the season has completed preseason games
 * and no real one. Phantom: records, not a preseason, and newer than every real game.
 */
export function classifySeasons(league: League, facts: SeasonFact[], realThrough: number | null): SeasonStatus[] {
  const typed = tracksSeasonType(league);
  return facts
    .map((f) => {
      const preseason = typed && (f.flaggedPreseason || (f.untyped && f.hasPreseasonGames && !f.hasRealGames));
      const phantom = f.played > 0 && !preseason && realThrough !== null && f.season > realThrough;
      return { season: f.season, played: f.played, preseason, phantom };
    })
    .sort((a, b) => b.season - a.season);
}

/** The seasons the site lists, newest first: everything but phantoms. */
export const visibleSeasons = (statuses: SeasonStatus[]): SeasonStatus[] => statuses.filter((s) => !s.phantom);

/** The newest season that was actually played: records, and neither a preseason nor a phantom. */
export const lastPlayedSeason = (statuses: SeasonStatus[]): number | null => visibleSeasons(statuses).find((s) => s.played > 0 && !s.preseason)?.season ?? null;

/**
 * The same rule as classifySeasons, as SQL, for the readers that pick the current season inside a query (the homepage's
 * table ranks, the daily snapshot): the newest season of `league` (a column expression) whose table is not a preseason
 * one and not newer than the newest real completed game. A season with no game yet (every team 0-0) is skipped too,
 * which only moves a reader from an empty table to the last real one. `extra` adds a condition on the candidate row `x`.
 */
export const currentStandingsSeasonSql = (league: string, extra = "true"): string =>
  `(select max(x.season) from standings x
    where x.league = ${league} and x.season_type is distinct from ${PRESEASON_TYPE} and (${extra})
      and x.season <= coalesce((select max(g.season_year) from games g where g.league = x.league and g.completed and g.stage <> 'excluded'), x.season))`;

/** The word for a preseason table, on every surface. */
export const PRESEASON_LABEL = "Preseason";

/** "Preseason records, the regular season starts Oct 20." from the date of the first regular-season game; without one, no date. */
export function preseasonNote(firstRegularDay: string | null): string {
  return firstRegularDay ? `Preseason records, the regular season starts ${firstRegularDay}. Teams are ranked from then.` : "Preseason records. Teams are ranked once the regular season starts.";
}
