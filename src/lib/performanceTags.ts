// src/lib/performanceTags.ts
import { cell, type PlayerLogRow, type PlayerSport } from "./playerProfile";

// One eligible stat: its tag label and how to read this game's raw value for it, independent of
// performanceLine/PlayerProfile entirely (performanceLine needs a whole season profile just to
// resolve which categories are "active" for an NFL position — this function only ever needs one
// row at a time, so it reads cell() directly rather than depending on that machinery). Verified
// against every StatSpec in src/lib/playerProfile.ts (all 9 NFL categories read, not guessed):
// excludes every spec with a `rate` property (fg_pct/3P%/FT%/YPC/punt-avg — percentages read as
// achievements poorly) and two named exceptions: NFL's pass_int (interceptions THROWN — a
// turnover, not an achievement; NFL's interceptions MADE, key "int", category "interceptions",
// stays eligible — same short label "INT" in the raw data, opposite meaning) and NBA's pm (+/- —
// not a counting achievement, and can be negative).
const ELIGIBLE_STATS: Record<PlayerSport, { key: string; label: string; read: (row: PlayerLogRow) => number | null }[]> = {
  nba: [
    { key: "pts", label: "PTS", read: (r) => cell(r.stats, "box", "PTS") },
    { key: "reb", label: "REB", read: (r) => cell(r.stats, "box", "REB") },
    { key: "ast", label: "AST", read: (r) => cell(r.stats, "box", "AST") },
    { key: "stl", label: "STL", read: (r) => cell(r.stats, "box", "STL") },
    { key: "blk", label: "BLK", read: (r) => cell(r.stats, "box", "BLK") },
  ],
  nfl: [
    { key: "pass_yds", label: "Pass YDS", read: (r) => cell(r.stats, "passing", "YDS") },
    { key: "pass_td", label: "Pass TD", read: (r) => cell(r.stats, "passing", "TD") },
    // pass_int deliberately absent — interceptions thrown, a turnover.
    { key: "rush_yds", label: "Rush YDS", read: (r) => cell(r.stats, "rushing", "YDS") },
    { key: "rush_td", label: "Rush TD", read: (r) => cell(r.stats, "rushing", "TD") },
    { key: "rec", label: "REC", read: (r) => cell(r.stats, "receiving", "REC") },
    { key: "rec_yds", label: "Rec YDS", read: (r) => cell(r.stats, "receiving", "YDS") },
    { key: "rec_td", label: "Rec TD", read: (r) => cell(r.stats, "receiving", "TD") },
    { key: "def_tot", label: "TKL", read: (r) => cell(r.stats, "defensive", "TOT") },
    { key: "def_sacks", label: "SCK", read: (r) => cell(r.stats, "defensive", "SACKS") },
    { key: "def_pd", label: "PD", read: (r) => cell(r.stats, "defensive", "PD") },
    { key: "int", label: "INT", read: (r) => cell(r.stats, "interceptions", "INT") }, // interceptions MADE — a defensive stat, not pass_int
    { key: "fgm", label: "FGM", read: (r) => cell(r.stats, "kicking", "FG", 0) },
    { key: "k_pts", label: "PTS", read: (r) => cell(r.stats, "kicking", "PTS") },
    { key: "punts", label: "PUNTS", read: (r) => cell(r.stats, "punting", "NO") },
    // fg_pct, rush_avg, punt_avg deliberately absent — all carry a `rate` property in playerProfile.ts.
  ],
  soccer: [], // out of scope this plan — never called with sport "soccer" (loadPerformanceCardData only ever resolves nba/nfl)
};

export function performanceTags(row: PlayerLogRow, priorRows: PlayerLogRow[], sport: PlayerSport, seasonComplete: boolean): string[] {
  const tags: string[] = [];

  if (seasonComplete) {
    for (const stat of ELIGIBLE_STATS[sport]) {
      const value = stat.read(row);
      if (value === null) continue;
      const priorMax = priorRows.reduce((max, r) => {
        const v = stat.read(r);
        return v !== null && v > max ? v : max;
      }, -Infinity);
      if (priorMax !== -Infinity && value > priorMax) {
        tags.push(`Season high · ${stat.label}`);
      }
    }
  }

  if (sport === "nba") {
    const cats = [cell(row.stats, "box", "PTS"), cell(row.stats, "box", "REB"), cell(row.stats, "box", "AST"), cell(row.stats, "box", "STL"), cell(row.stats, "box", "BLK")];
    const reached = cats.filter((v) => v !== null && v >= 10).length;
    if (reached >= 3) tags.push("Triple-double");
  }

  return tags;
}
