// Player figures the reference sites compute from a line's totals instead of averaging or summing per-game cells.
// Pure and shared: the player pages (season, career and split lines) and the league leaders use the same functions,
// so one player never has two passer ratings or two kicker point totals on the site.

const clamp = (n: number): number => Math.min(2.375, Math.max(0, n));

/** The NFL passer rating of a line from its totals: completions, attempts, yards, touchdowns and interceptions.
 * The standard formula: four components, each clamped to 0..2.375, rating = (a + b + c + d) / 6 x 100, rounded to
 * one decimal like every other rating cell. Null when there are no attempts (no rating, not a 0). A season or career
 * rating is this over the season's or career's totals; the mean of the per-game ratings is a different number. */
export function passerRating(completions: number, attempts: number, yards: number, touchdowns: number, interceptions: number): number | null {
  if (!(attempts > 0)) return null;
  const a = clamp((completions / attempts - 0.3) * 5);
  const b = clamp((yards / attempts - 3) * 0.25);
  const c = clamp((touchdowns / attempts) * 20);
  const d = clamp(2.375 - (interceptions / attempts) * 25);
  return Math.round(((a + b + c + d) / 6) * 1000) / 10;
}

/** A kicker's points: three per field goal made and one per extra point made. ESPN's PTS cell for a game can disagree
 * with the game's own FG and XP cells (one game says 9 for 2 field goals and 4 extra points), so season and career
 * lines are built from the made counts. The game log keeps ESPN's figure. */
export function kickerPoints(fieldGoalsMade: number, extraPointsMade: number): number {
  return 3 * fieldGoalsMade + extraPointsMade;
}

/**
 * Baseball's innings-pitched figure is not a decimal: "5.2" is five innings and two outs, five and
 * two thirds. So it cannot be added up as printed — two outings of 5.2 are 11.1 innings, and adding
 * the figures gives 10.4, which is not even a legal figure. Everything that totals innings therefore
 * counts outs, the unit the sport actually measures, and converts back only to print.
 *
 * Null for a cell that is not a figure at all ("--", an empty cell, a missing one), and for a
 * fractional part above .2, which no real figure has.
 */
export function outsFromInnings(innings: string | number | null | undefined): number | null {
  if (innings === null || innings === undefined) return null;
  const m = /^(\d+)(?:\.(\d))?$/.exec(String(innings).trim());
  if (!m) return null;
  const thirds = m[2] === undefined ? 0 : Number(m[2]);
  if (thirds > 2) return null;
  return Number(m[1]) * 3 + thirds;
}

/** Outs back to the printed innings figure: 34 outs is 11.1, eleven innings and one out. */
export function inningsFromOuts(outs: number): number {
  const whole = Math.floor(outs / 3);
  return whole + (outs % 3) / 10;
}

/**
 * The earned run average of a line: nine earned runs per nine innings, computed from the outs
 * (27 earned runs per out, since nine innings are 27 outs). Null with no outs recorded — an ERA of
 * zero and an ERA of nothing are different things, and the reference sites print neither as 0.00.
 * A season's ERA is this over the season's totals; the mean of the per-game figures is another number.
 */
export function earnedRunAverage(earnedRuns: number, outs: number): number | null {
  return outs > 0 ? (27 * earnedRuns) / outs : null;
}

/** A batting average: hits over at bats. Null with no at bats (a walk-only game has no average). */
export function battingAverage(hits: number, atBats: number): number | null {
  return atBats > 0 ? hits / atBats : null;
}
