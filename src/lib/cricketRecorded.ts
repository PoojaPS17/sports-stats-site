// Balls faced and boundary counts are not recorded for much of cricket's early history (ESPN returns 0 for a value
// the scorers never took). The owner's rule: say "not recorded", never show a zero or a total that looks complete
// beside a full runs total. This module holds the wording and the two decisions every surface shares:
//   - a career: how many of a player's innings have balls faced recorded (a strike rate over some innings says so);
//   - a scorecard: a team-innings with no balls (or no boundaries in a total of 50+) was not recorded, and so
//     its cells read "-" with a legend. Mirrors scripts/lib/cricket-career.ts, which stores null for the same cases.
// Pure: no database, so the pages, the share images and the tests all use it.
import type { CricketInningsRow, CricketTeamScorecard } from "./matchDetail";

/** The word for a career figure with no innings that recorded it. */
export const NOT_RECORDED = "not recorded";
/** What a scorecard or century table cell shows for an unrecorded value. */
export const UNRECORDED_CELL = "-";
/** The footnote under any table with a dash from this. */
export const UNRECORDED_LEGEND = "A dash means the scorers did not record it: balls faced, boundaries and strike rate are missing for many older matches.";

export type Coverage = "full" | "partial" | "none";

/** How much of a player's batting has the figure: "none" with no innings recorded, "partial" with some. No innings at all is "full" (nothing to qualify). */
export function coverageOf(recorded: number, total: number): Coverage {
  if (total <= 0) return "full";
  if (recorded <= 0) return "none";
  return recorded < total ? "partial" : "full";
}

/**
 * A career strike rate as the stat tile shows it: the rate cut to two decimals, "not recorded" when no innings
 * has balls faced, and the rate with "over n of m innings" when only some do. `format` writes the rate.
 */
export function strikeRateTile(rate: number | null, recorded: number, total: number, format: (n: number | null) => string): { value: string; note: string | null } {
  const coverage = coverageOf(recorded, total);
  if (coverage === "none") return { value: NOT_RECORDED, note: null };
  const value = format(rate);
  return { value, note: coverage === "partial" && value !== "-" ? `over ${recorded} of ${total} innings` : null };
}

const count = (s: string | undefined): number => (s != null && /^\d+$/.test(s.trim()) ? Number(s) : 0);

function maskRows(rows: CricketInningsRow[], labels: string[]): CricketInningsRow[] {
  const r = labels.indexOf("R");
  const b = labels.indexOf("B");
  const f = labels.indexOf("4s");
  const x = labels.indexOf("6s");
  const sr = labels.indexOf("SR");
  if (r < 0 || b < 0) return rows;

  const sums = new Map<number, { runs: number; balls: number; boundaries: number }>();
  for (const row of rows) {
    const key = row.innings ?? 0;
    const t = sums.get(key) ?? { runs: 0, balls: 0, boundaries: 0 };
    t.runs += count(row.stats[r]);
    t.balls += count(row.stats[b]);
    t.boundaries += (f >= 0 ? count(row.stats[f]) : 0) + (x >= 0 ? count(row.stats[x]) : 0);
    sums.set(key, t);
  }

  return rows.map((row) => {
    const t = sums.get(row.innings ?? 0)!;
    // No ball faced by anyone in an innings that scored, or runs off no balls: the balls were not taken down.
    const noBalls = (t.balls === 0 && t.runs > 0) || (count(row.stats[r]) > 0 && count(row.stats[b]) === 0);
    // The same test the loader applies: a total of 50 or more with not one boundary was not recorded.
    const noBoundaries = f >= 0 && x >= 0 && t.boundaries === 0 && t.runs >= 50;
    if (!noBalls && !noBoundaries) return row;
    const stats = [...row.stats];
    if (noBalls) {
      stats[b] = UNRECORDED_CELL;
      if (sr >= 0) stats[sr] = UNRECORDED_CELL;
    }
    if (noBoundaries) {
      stats[f] = UNRECORDED_CELL;
      stats[x] = UNRECORDED_CELL;
    }
    return stats.every((v, i) => v === row.stats[i]) ? row : { ...row, stats };
  });
}

/**
 * The scorecard with every unrecorded batting cell written "-" instead of ESPN's 0. Applied when a card is parsed
 * and again when it is shown, so a card stored before this rule existed reads the same way. Idempotent; a card
 * with everything recorded comes back unchanged (same object).
 */
export function maskUnrecorded(scorecard: CricketTeamScorecard[]): CricketTeamScorecard[] {
  let changed = false;
  const out = scorecard.map((team) => {
    const battingRows = maskRows(team.battingRows, team.battingLabels);
    if (battingRows.every((row, i) => row === team.battingRows[i])) return team;
    changed = true;
    return { ...team, battingRows };
  });
  return changed ? out : scorecard;
}

/** True when any batting row of these tables has a dash where balls, boundaries or strike rate belong: the legend is due. */
export function hasUnrecordedCells(rows: CricketInningsRow[], labels: string[]): boolean {
  const columns = ["B", "4s", "6s", "SR"].map((l) => labels.indexOf(l)).filter((i) => i >= 0);
  return rows.some((row) => columns.some((i) => row.stats[i] === UNRECORDED_CELL));
}
