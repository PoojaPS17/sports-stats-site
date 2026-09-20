// ESPN's own whole-season NBA line, read from the row stored in player_season_stats.categories
// (category name -> { labels, values }). Pure: the profile uses it where the site's game rows
// are short of the games ESPN counts.

export interface EspnSeasonTotals {
  games: number; // averages GP
  starts: number | null; // averages GS (a count)
  minutesPerGame: number | null; // averages MIN
  pts: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  to: number; // totals, exact
  fgm: number;
  fga: number;
  tpm: number;
  tpa: number;
  ftm: number;
  fta: number; // totals "made-attempted"
}

/** The value under `label` in one stored category, or null when the label is absent or the value blank. */
function valueOf(cat: unknown, label: string): string | null {
  if (typeof cat !== "object" || cat === null) return null;
  const { labels, values } = cat as { labels?: unknown; values?: unknown };
  if (!Array.isArray(labels) || !Array.isArray(values)) return null;
  const i = labels.indexOf(label);
  if (i === -1) return null;
  const v = values[i];
  if (typeof v !== "string" && typeof v !== "number") return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

function numberAt(cat: unknown, label: string): number | null {
  const v = valueOf(cat, label);
  if (v === null) return null;
  const n = Number(v.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function pairAt(cat: unknown, label: string): [number, number] | null {
  const v = valueOf(cat, label);
  const m = v === null ? null : /^([\d,]+)-([\d,]+)$/.exec(v);
  return m ? [Number(m[1].replace(/,/g, "")), Number(m[2].replace(/,/g, ""))] : null;
}

/** ESPN's season line, or null unless GP is a positive number and every one of PTS, REB, AST, STL, BLK,
 * TO, FG, 3PT and FT is readable in the totals. */
export function espnSeasonTotals(categories: unknown): EspnSeasonTotals | null {
  if (typeof categories !== "object" || categories === null) return null;
  const { averages, totals } = categories as { averages?: unknown; totals?: unknown };
  const games = numberAt(averages, "GP");
  if (games === null || games <= 0) return null;
  const pts = numberAt(totals, "PTS");
  const reb = numberAt(totals, "REB");
  const ast = numberAt(totals, "AST");
  const stl = numberAt(totals, "STL");
  const blk = numberAt(totals, "BLK");
  const to = numberAt(totals, "TO");
  const fg = pairAt(totals, "FG");
  const tp = pairAt(totals, "3PT");
  const ft = pairAt(totals, "FT");
  if (pts === null || reb === null || ast === null || stl === null || blk === null || to === null || !fg || !tp || !ft) return null;
  return {
    games,
    starts: numberAt(averages, "GS"),
    minutesPerGame: numberAt(averages, "MIN"),
    pts,
    reb,
    ast,
    stl,
    blk,
    to,
    fgm: fg[0],
    fga: fg[1],
    tpm: tp[0],
    tpa: tp[1],
    ftm: ft[0],
    fta: ft[1],
  };
}
