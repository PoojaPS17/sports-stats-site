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
