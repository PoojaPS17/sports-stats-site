import type { ResultLetter } from "./teamSummary";

/** A run shorter than this is just form, not something to put in a heading. */
export const MIN_WIN_STREAK = 3;
export const MIN_UNBEATEN_RUN = 5;
/** A run is "current" only while the team is still playing: past this many days since its last result (an international break, a bye week) it is last season's news. */
export const FRESH_DAYS = 21;

function leadingRun(results: ResultLetter[], keep: (r: ResultLetter) => boolean): number {
  let n = 0;
  for (const r of results) {
    if (!keep(r)) break;
    n++;
  }
  return n;
}

/**
 * One-number claims for a team's header, from this season's results only (most recent first). A run that
 * reaches the first game of the list may have started earlier, so it is worded as the season's own ("won all
 * 8 games this season") rather than as a streak of that length. Football adds an unbeaten run, since a draw
 * ends a win streak but not that. Nothing is claimed from a short run, or once the team's last result is more
 * than FRESH_DAYS old.
 */
export function teamClaims(results: ResultLetter[], opts: { soccer: boolean; lastPlayed: Date | null; now?: Date }): string[] {
  const claims: string[] = [];
  const now = opts.now ?? new Date();
  if (!opts.lastPlayed || now.getTime() - opts.lastPlayed.getTime() > FRESH_DAYS * 86_400_000) return claims;
  const total = results.length;
  const wins = leadingRun(results, (r) => r === "W");
  if (wins >= MIN_WIN_STREAK) claims.push(wins === total ? `Won all ${wins} games this season` : `${wins} straight wins`);
  if (opts.soccer) {
    const unbeaten = leadingRun(results, (r) => r !== "L");
    if (unbeaten >= MIN_UNBEATEN_RUN && unbeaten > wins) claims.push(unbeaten === total ? `Unbeaten in ${unbeaten} games this season` : `Unbeaten in ${unbeaten}`);
  }
  return claims;
}
