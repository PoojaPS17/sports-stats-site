import { FRESH_DAYS } from "./heroClaims";
import type { PlayerLogRow, PlayerSport } from "./playerProfile";

/** A per-game figure whose season high is worth printing. A rate (yards per punt) or a mixed count (goals plus
 * assists, saves) is not: "season high 1 goal or assist" says nothing. */
const HIGH_LABELS = new Set(["Points", "Hits", "Strikeouts", "Passing yards", "Yards from scrimmage", "Tackles"]);
/** Prior games with a figure before the latest one can be called a season high: two games of data is not a season. */
export const MIN_PRIOR_GAMES = 5;
/** An NBA scoring streak is worth a pill from this many games, at this many points. */
export const MIN_SCORING_STREAK = 5;
export const SCORING_LINE = 20;
/** A run of games with a goal or an assist, in football. */
export const MIN_INVOLVEMENT_RUN = 3;

/**
 * One-number claims for a player's header, from this season's regular-season games only. `rows` are the player's
 * appearances (newest first, as the profile holds them); `form` is the profile's per-game lead figure (points for an
 * NBA player, hits or strikeouts in baseball, the position's yards or tackles in the NFL, goals plus assists for a
 * football outfielder). A run that reaches the first game of the season may have started earlier, so it is worded
 * as the season's own. Nothing is claimed from a game with no box score, a short run, or once the last game is
 * more than FRESH_DAYS old.
 */
export function playerClaims(
  rows: PlayerLogRow[],
  form: { label: string; value: (row: PlayerLogRow) => number | null },
  sport: PlayerSport,
  opts: { now?: Date } = {},
): string[] {
  const now = opts.now ?? new Date();
  const last = rows[0];
  if (!last) return [];
  if (now.getTime() - new Date(last.date).getTime() > FRESH_DAYS * 86_400_000) return [];
  const season = last.season_year;
  if (season === null) return [];
  const games = rows.filter((r) => r.season_year === season);
  // A game with no box score has no figure: it ends a run rather than being skipped over, and it cannot be a season high.
  const values = games.map((r) => (r.no_box_score ? null : form.value(r)));
  const claims: string[] = [];

  const latest = values[0];
  if (HIGH_LABELS.has(form.label) && latest !== null && latest > 0) {
    const prior = values.slice(1).filter((v): v is number => v !== null);
    if (prior.length >= MIN_PRIOR_GAMES && latest > Math.max(...prior)) claims.push(`Season high ${latest} ${form.label.toLowerCase()}`);
  }

  const run = (keep: (v: number) => boolean): number => {
    let n = 0;
    for (const v of values) {
      if (v === null || !keep(v)) break;
      n++;
    }
    return n;
  };
  if (sport === "nba" && form.label === "Points") {
    const n = run((v) => v >= SCORING_LINE);
    if (n >= MIN_SCORING_STREAK) claims.push(n === games.length ? `${SCORING_LINE}+ points in all ${n} games` : `${SCORING_LINE}+ points in ${n} straight games`);
  }
  if (sport === "soccer" && form.label === "Goals + assists") {
    const n = run((v) => v > 0);
    if (n >= MIN_INVOLVEMENT_RUN) claims.push(n === games.length ? `Goal or assist in all ${n} games` : `Goal or assist in ${n} straight games`);
  }
  return claims;
}
