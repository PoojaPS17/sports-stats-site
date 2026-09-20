// Everything a player page derives from that player's per-game box scores: career
// totals, season-by-season lines, home/away and opponent splits, best games, career
// landmarks and recent form. All of it is computed from the stored game log rather
// than maintained as running totals, so a re-run of the backfill can never
// double-count and every number on the page traces back to a game you can open.
import type { EspnSeasonTotals } from "./espnSeason";
import type { GameStage } from "./gameStage";
import { isSoccerLeague, type League } from "./leagues";

export type PlayerSport = "soccer" | "nfl" | "nba";

export function playerSport(league: League): PlayerSport | null {
  if (isSoccerLeague(league)) return "soccer";
  if (league === "nfl") return "nfl";
  if (league === "nba") return "nba";
  return null;
}

export type Stats = Record<string, Record<string, string>>;
export type GameResult = "W" | "D" | "L";

export interface PlayerLogRow {
  game_espn_id: string;
  date: string;
  season_year: number | null;
  round: string | null;
  week: number | null;
  /** The game's stage (games.stage): regular season, playoffs, play-in, excluded or other. */
  stage: GameStage;
  season_type: number | null;
  competition_type: string | null;
  is_home: boolean;
  team_espn_id: string;
  team_name: string;
  team_slug: string;
  team_abbr: string | null;
  team_logo: string | null;
  opponent_espn_id: string;
  opponent_name: string;
  opponent_slug: string;
  opponent_abbr: string | null;
  opponent_logo: string | null;
  team_score: number | null;
  opponent_score: number | null;
  result: GameResult | null;
  stats: Stats;
  /** NBA only: true when no player in the game has a real stat line (ESPN published none), so this row is a
   * listed participant with zeros rather than a game the player has figures for. */
  no_box_score?: boolean;
}

/** One number from a box-score cell: "23/33" or "3-11" → first part (or second with part=1). A "/" or "-"
 * separates only when it sits between two digits, so a leading minus stays a sign ("-3" is -3). */
export function cell(stats: Stats, category: string, label: string, part: 0 | 1 = 0): number | null {
  const raw = stats[category]?.[label];
  if (raw === undefined || raw === null || raw === "" || raw === "--") return null;
  const parts = String(raw).split(/(?<=\d)[/-](?=\d)/);
  const n = Number(parts[part] ?? parts[0]);
  return Number.isFinite(n) ? n : null;
}

export interface StatSpec {
  key: string;
  /** Column header. */
  label: string;
  /** Full name for tooltips and the headline cards. */
  title: string;
  value: (stats: Stats) => number | null;
  /** How a season/career figure is built from the per-game values. */
  agg: "sum" | "avg" | "max";
  /** For a percentage or ratio: aggregate as sum(num)/sum(den) of two other specs. */
  rate?: { num: string; den: string; pct?: boolean };
  decimals?: number;
  /** Show as a game-log column (default true). */
  log?: boolean;
  /** Show in the season and career tables (default true). */
  table?: boolean;
  /** Feature on the headline cards. */
  headline?: boolean;
}

export interface SportProfile {
  sport: PlayerSport;
  specs: StatSpec[];
  /** Label for "games" (apps for soccer). */
  gamesLabel: string;
  /** Lexicographic sort keys for ranking a player's best games, best first. */
  rank: (row: PlayerLogRow) => number[];
  rankNote: string;
  /** Per-game value plotted on the form chart, with its label. */
  form: { label: string; value: (row: PlayerLogRow) => number | null };
  /** Excludes rows that aren't real appearances (an unused soccer substitute). */
  played: (row: PlayerLogRow) => boolean;
}

const sum = (...xs: (number | null)[]) => xs.reduce<number>((a, b) => a + (b ?? 0), 0);

// ---------------------------------------------------------------------------
// Soccer
// ---------------------------------------------------------------------------
const m = (label: string) => (s: Stats) => cell(s, "match", label);
const started = (s: Stats) => (cell(s, "match", "APP") === 1 && cell(s, "match", "SUBIN") === 0 ? 1 : 0);

const SOCCER_OUTFIELD: StatSpec[] = [
  { key: "starts", label: "Starts", title: "Starts", value: started, agg: "sum", log: false },
  { key: "g", label: "G", title: "Goals", value: m("G"), agg: "sum", headline: true },
  { key: "a", label: "A", title: "Assists", value: m("A"), agg: "sum", headline: true },
  { key: "shot", label: "SH", title: "Shots", value: m("SHOT"), agg: "sum" },
  { key: "sog", label: "SOT", title: "Shots on target", value: m("SOG"), agg: "sum", headline: true },
  { key: "fc", label: "FC", title: "Fouls committed", value: m("FC"), agg: "sum", table: false },
  { key: "fa", label: "FA", title: "Fouls suffered", value: m("FA"), agg: "sum", table: false },
  { key: "yc", label: "YC", title: "Yellow cards", value: m("YC"), agg: "sum", headline: true },
  { key: "rc", label: "RC", title: "Red cards", value: m("RC"), agg: "sum" },
];

const SOCCER_KEEPER: StatSpec[] = [
  { key: "starts", label: "Starts", title: "Starts", value: started, agg: "sum", log: false },
  { key: "sv", label: "SV", title: "Saves", value: m("SV"), agg: "sum", headline: true },
  { key: "ga", label: "GA", title: "Goals conceded", value: m("GA"), agg: "sum", headline: true },
  { key: "cs", label: "CS", title: "Clean sheets", value: (s) => (cell(s, "match", "APP") === 1 ? (cell(s, "match", "GA") === 0 ? 1 : 0) : null), agg: "sum", headline: true },
  { key: "yc", label: "YC", title: "Yellow cards", value: m("YC"), agg: "sum" },
  { key: "rc", label: "RC", title: "Red cards", value: m("RC"), agg: "sum" },
];

function soccerProfile(rows: PlayerLogRow[]): SportProfile {
  const apps = rows.filter((r) => cell(r.stats, "match", "APP") === 1);
  const keeper = apps.length > 0 && apps.filter((r) => r.stats.match?.SV !== undefined).length * 2 > apps.length;
  return {
    sport: "soccer",
    specs: keeper ? SOCCER_KEEPER : SOCCER_OUTFIELD,
    gamesLabel: "Apps",
    rank: keeper
      ? (r) => [cell(r.stats, "match", "GA") === 0 ? 1 : 0, cell(r.stats, "match", "SV") ?? 0, -(cell(r.stats, "match", "GA") ?? 0)]
      : (r) => [cell(r.stats, "match", "G") ?? 0, cell(r.stats, "match", "A") ?? 0, cell(r.stats, "match", "SOG") ?? 0],
    rankNote: keeper ? "Ranked by clean sheet, then saves." : "Ranked by goals, then assists, then shots on target.",
    form: keeper
      ? { label: "Saves", value: (r) => cell(r.stats, "match", "SV") }
      : { label: "Goals + assists", value: (r) => sum(cell(r.stats, "match", "G"), cell(r.stats, "match", "A")) },
    played: (r) => cell(r.stats, "match", "APP") === 1,
  };
}

// ---------------------------------------------------------------------------
// NFL — columns follow the categories this player actually has figures in.
// ---------------------------------------------------------------------------
const c = (cat: string, label: string, part: 0 | 1 = 0) => (s: Stats) => cell(s, cat, label, part);

const NFL_CATEGORY_SPECS: Record<string, StatSpec[]> = {
  passing: [
    { key: "pass_cmp", label: "CMP", title: "Completions", value: c("passing", "C/ATT", 0), agg: "sum" },
    { key: "pass_att", label: "ATT", title: "Pass attempts", value: c("passing", "C/ATT", 1), agg: "sum" },
    { key: "pass_yds", label: "Pass YDS", title: "Passing yards", value: c("passing", "YDS"), agg: "sum", headline: true },
    { key: "pass_td", label: "Pass TD", title: "Passing touchdowns", value: c("passing", "TD"), agg: "sum", headline: true },
    { key: "pass_int", label: "INT", title: "Interceptions thrown", value: c("passing", "INT"), agg: "sum", headline: true },
    { key: "pass_rtg", label: "RTG", title: "Passer rating", value: c("passing", "RTG"), agg: "avg", decimals: 1 },
  ],
  rushing: [
    { key: "rush_car", label: "CAR", title: "Carries", value: c("rushing", "CAR"), agg: "sum" },
    { key: "rush_yds", label: "Rush YDS", title: "Rushing yards", value: c("rushing", "YDS"), agg: "sum", headline: true },
    { key: "rush_avg", label: "AVG", title: "Yards per carry", value: c("rushing", "AVG"), agg: "avg", rate: { num: "rush_yds", den: "rush_car" }, decimals: 1, log: false },
    { key: "rush_td", label: "Rush TD", title: "Rushing touchdowns", value: c("rushing", "TD"), agg: "sum", headline: true },
  ],
  receiving: [
    { key: "rec", label: "REC", title: "Receptions", value: c("receiving", "REC"), agg: "sum", headline: true },
    { key: "rec_tgts", label: "TGT", title: "Targets", value: c("receiving", "TGTS"), agg: "sum" },
    { key: "rec_yds", label: "Rec YDS", title: "Receiving yards", value: c("receiving", "YDS"), agg: "sum", headline: true },
    { key: "rec_td", label: "Rec TD", title: "Receiving touchdowns", value: c("receiving", "TD"), agg: "sum", headline: true },
  ],
  defensive: [
    { key: "def_tot", label: "TKL", title: "Total tackles", value: c("defensive", "TOT"), agg: "sum", headline: true },
    { key: "def_solo", label: "SOLO", title: "Solo tackles", value: c("defensive", "SOLO"), agg: "sum" },
    { key: "def_sacks", label: "SCK", title: "Sacks", value: c("defensive", "SACKS"), agg: "sum", decimals: 1, headline: true },
    { key: "def_tfl", label: "TFL", title: "Tackles for loss", value: c("defensive", "TFL"), agg: "sum" },
    { key: "def_pd", label: "PD", title: "Passes defended", value: c("defensive", "PD"), agg: "sum", headline: true },
  ],
  interceptions: [{ key: "int", label: "INT", title: "Interceptions", value: c("interceptions", "INT"), agg: "sum", headline: true }],
  fumbles: [
    { key: "fum", label: "FUM", title: "Fumbles", value: c("fumbles", "FUM"), agg: "sum" },
    { key: "fum_lost", label: "LOST", title: "Fumbles lost", value: c("fumbles", "LOST"), agg: "sum" },
  ],
  kicking: [
    { key: "fgm", label: "FGM", title: "Field goals made", value: c("kicking", "FG", 0), agg: "sum", headline: true },
    { key: "fga", label: "FGA", title: "Field goals attempted", value: c("kicking", "FG", 1), agg: "sum" },
    { key: "fg_pct", label: "FG%", title: "Field goal percentage", value: (s) => { const a = cell(s, "kicking", "FG", 1); const mm = cell(s, "kicking", "FG", 0); return a ? (100 * (mm ?? 0)) / a : null; }, agg: "avg", rate: { num: "fgm", den: "fga", pct: true }, decimals: 1, log: false, headline: true },
    { key: "fg_long", label: "LNG", title: "Longest field goal", value: c("kicking", "LONG"), agg: "max" },
    { key: "xpm", label: "XPM", title: "Extra points made", value: c("kicking", "XP", 0), agg: "sum" },
    { key: "k_pts", label: "PTS", title: "Points", value: c("kicking", "PTS"), agg: "sum", headline: true },
  ],
  punting: [
    { key: "punts", label: "PUNTS", title: "Punts", value: c("punting", "NO"), agg: "sum", headline: true },
    { key: "punt_yds", label: "YDS", title: "Punt yards", value: c("punting", "YDS"), agg: "sum" },
    { key: "punt_avg", label: "AVG", title: "Yards per punt", value: c("punting", "AVG"), agg: "avg", rate: { num: "punt_yds", den: "punts" }, decimals: 1, headline: true },
    { key: "punt_in20", label: "IN20", title: "Punts inside the 20", value: c("punting", "In 20"), agg: "sum" },
  ],
  kickReturns: [
    { key: "kr", label: "KR", title: "Kick returns", value: c("kickReturns", "NO"), agg: "sum" },
    { key: "kr_yds", label: "KR YDS", title: "Kick return yards", value: c("kickReturns", "YDS"), agg: "sum" },
    { key: "kr_td", label: "KR TD", title: "Kick return touchdowns", value: c("kickReturns", "TD"), agg: "sum" },
  ],
  puntReturns: [
    { key: "pr", label: "PR", title: "Punt returns", value: c("puntReturns", "NO"), agg: "sum" },
    { key: "pr_yds", label: "PR YDS", title: "Punt return yards", value: c("puntReturns", "YDS"), agg: "sum" },
    { key: "pr_td", label: "PR TD", title: "Punt return touchdowns", value: c("puntReturns", "TD"), agg: "sum" },
  ],
};
const NFL_CATEGORY_ORDER = Object.keys(NFL_CATEGORY_SPECS);

function nflProfile(rows: PlayerLogRow[]): SportProfile {
  const counts = new Map<string, number>();
  for (const r of rows) for (const cat of Object.keys(r.stats)) counts.set(cat, (counts.get(cat) ?? 0) + 1);
  // A category earns columns when it appears in at least a tenth of the player's
  // games (a receiver's occasional carry doesn't make him a rusher) — or is the most
  // common category, so every player has at least one.
  const most = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const active = NFL_CATEGORY_ORDER.filter((cat) => cat === most || (counts.get(cat) ?? 0) >= Math.max(1, rows.length / 10));
  const specs = active.flatMap((cat) => NFL_CATEGORY_SPECS[cat]);
  const primary = most ?? "defensive";
  const rankers: Record<string, (r: PlayerLogRow) => number[]> = {
    passing: (r) => [cell(r.stats, "passing", "YDS") ?? 0, cell(r.stats, "passing", "TD") ?? 0, -(cell(r.stats, "passing", "INT") ?? 0)],
    rushing: (r) => [sum(cell(r.stats, "rushing", "YDS"), cell(r.stats, "receiving", "YDS")), sum(cell(r.stats, "rushing", "TD"), cell(r.stats, "receiving", "TD"))],
    receiving: (r) => [sum(cell(r.stats, "receiving", "YDS"), cell(r.stats, "rushing", "YDS")), sum(cell(r.stats, "receiving", "TD"), cell(r.stats, "rushing", "TD")), cell(r.stats, "receiving", "REC") ?? 0],
    defensive: (r) => [cell(r.stats, "defensive", "TOT") ?? 0, cell(r.stats, "defensive", "SACKS") ?? 0, cell(r.stats, "interceptions", "INT") ?? 0],
    kicking: (r) => [cell(r.stats, "kicking", "PTS") ?? 0, cell(r.stats, "kicking", "FG", 0) ?? 0, cell(r.stats, "kicking", "LONG") ?? 0],
    punting: (r) => [cell(r.stats, "punting", "AVG") ?? 0, cell(r.stats, "punting", "In 20") ?? 0],
  };
  const notes: Record<string, string> = {
    passing: "Ranked by passing yards, then touchdowns, fewest interceptions.",
    rushing: "Ranked by rushing plus receiving yards, then touchdowns.",
    receiving: "Ranked by receiving plus rushing yards, then touchdowns, then catches.",
    defensive: "Ranked by tackles, then sacks, then interceptions.",
    kicking: "Ranked by points, then field goals made.",
    punting: "Ranked by yards per punt, then punts inside the 20.",
  };
  const forms: Record<string, SportProfile["form"]> = {
    passing: { label: "Passing yards", value: (r) => cell(r.stats, "passing", "YDS") },
    rushing: { label: "Yards from scrimmage", value: (r) => sum(cell(r.stats, "rushing", "YDS"), cell(r.stats, "receiving", "YDS")) },
    receiving: { label: "Yards from scrimmage", value: (r) => sum(cell(r.stats, "receiving", "YDS"), cell(r.stats, "rushing", "YDS")) },
    defensive: { label: "Tackles", value: (r) => cell(r.stats, "defensive", "TOT") },
    kicking: { label: "Points", value: (r) => cell(r.stats, "kicking", "PTS") },
    punting: { label: "Yards per punt", value: (r) => cell(r.stats, "punting", "AVG") },
  };
  const fallback = "defensive";
  return {
    sport: "nfl",
    specs,
    gamesLabel: "GP",
    rank: rankers[primary] ?? rankers[fallback],
    rankNote: notes[primary] ?? notes[fallback],
    form: forms[primary] ?? forms[fallback],
    played: () => true,
  };
}

// ---------------------------------------------------------------------------
// NBA — one "box" category; season and career lines read as per-game averages.
// ---------------------------------------------------------------------------
const b = (label: string, part: 0 | 1 = 0) => (s: Stats) => cell(s, "box", label, part);
const NBA_SPECS: StatSpec[] = [
  { key: "gs", label: "GS", title: "Games started", value: b("GS"), agg: "sum", log: false },
  { key: "min", label: "MIN", title: "Minutes", value: b("MIN"), agg: "avg", decimals: 1 },
  { key: "pts", label: "PTS", title: "Points", value: b("PTS"), agg: "avg", decimals: 1, headline: true },
  { key: "reb", label: "REB", title: "Rebounds", value: b("REB"), agg: "avg", decimals: 1, headline: true },
  { key: "ast", label: "AST", title: "Assists", value: b("AST"), agg: "avg", decimals: 1, headline: true },
  { key: "stl", label: "STL", title: "Steals", value: b("STL"), agg: "avg", decimals: 1 },
  { key: "blk", label: "BLK", title: "Blocks", value: b("BLK"), agg: "avg", decimals: 1 },
  { key: "to", label: "TO", title: "Turnovers", value: b("TO"), agg: "avg", decimals: 1 },
  { key: "fgm", label: "FGM", title: "Field goals made", value: b("FG", 0), agg: "sum", log: false, table: false },
  { key: "fga", label: "FGA", title: "Field goals attempted", value: b("FG", 1), agg: "sum", log: false, table: false },
  { key: "fg_pct", label: "FG%", title: "Field goal percentage", value: (s) => { const a = cell(s, "box", "FG", 1); return a ? (100 * (cell(s, "box", "FG", 0) ?? 0)) / a : null; }, agg: "avg", rate: { num: "fgm", den: "fga", pct: true }, decimals: 1, headline: true },
  { key: "tpm", label: "3PM", title: "Three-pointers made", value: b("3PT", 0), agg: "sum", log: false, table: false },
  { key: "tpa", label: "3PA", title: "Three-pointers attempted", value: b("3PT", 1), agg: "sum", log: false, table: false },
  { key: "tp_pct", label: "3P%", title: "Three-point percentage", value: (s) => { const a = cell(s, "box", "3PT", 1); return a ? (100 * (cell(s, "box", "3PT", 0) ?? 0)) / a : null; }, agg: "avg", rate: { num: "tpm", den: "tpa", pct: true }, decimals: 1 },
  { key: "ftm", label: "FTM", title: "Free throws made", value: b("FT", 0), agg: "sum", log: false, table: false },
  { key: "fta", label: "FTA", title: "Free throws attempted", value: b("FT", 1), agg: "sum", log: false, table: false },
  { key: "ft_pct", label: "FT%", title: "Free throw percentage", value: (s) => { const a = cell(s, "box", "FT", 1); return a ? (100 * (cell(s, "box", "FT", 0) ?? 0)) / a : null; }, agg: "avg", rate: { num: "ftm", den: "fta", pct: true }, decimals: 1 },
  { key: "pm", label: "+/-", title: "Plus/minus", value: b("+/-"), agg: "avg", decimals: 1, table: false },
];

function nbaProfile(): SportProfile {
  return {
    sport: "nba",
    specs: NBA_SPECS,
    gamesLabel: "GP",
    rank: (r) => [cell(r.stats, "box", "PTS") ?? 0, sum(cell(r.stats, "box", "REB"), cell(r.stats, "box", "AST"))],
    rankNote: "Ranked by points, then rebounds plus assists.",
    form: { label: "Points", value: (r) => cell(r.stats, "box", "PTS") },
    // ESPN counts every game with a minutes line, a sub-minute "0" included. A "--" or missing minutes
    // cell is a bench-sheet DNP, unless there are points on the line.
    played: (r) => cell(r.stats, "box", "MIN") !== null || (cell(r.stats, "box", "PTS") ?? 0) > 0,
  };
}

export function sportProfile(sport: PlayerSport, rows: PlayerLogRow[]): SportProfile {
  if (sport === "soccer") return soccerProfile(rows);
  if (sport === "nfl") return nflProfile(rows);
  return nbaProfile();
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------
export type Line = Record<string, number | null>;

export interface Record3 {
  w: number;
  d: number;
  l: number;
}

type EspnPart = { total: number; n: number };

/** What one ESPN season adds to a stat's total and to the games it is divided by; null where ESPN
 * publishes no figure (plus/minus). ESPN's minutes are a per-game average, so they are scaled back to games. */
function espnPart(t: EspnSeasonTotals, key: string): EspnPart | null {
  const g = t.games;
  switch (key) {
    case "gs": return t.starts === null ? null : { total: t.starts, n: g };
    case "min": return t.minutesPerGame === null ? null : { total: t.minutesPerGame * g, n: g };
    case "pts": case "reb": case "ast": case "stl": case "blk": case "to": return { total: t[key], n: g };
    case "fgm": case "fga": case "tpm": case "tpa": case "ftm": case "fta": return { total: t[key], n: g };
    default: return null; // pm has no ESPN figure
  }
}

/** A line over game rows plus whole ESPN seasons: each stat is the rows' values plus ESPN's totals, over the
 * rows with a value plus ESPN's games. A stat ESPN gives no figure for is null once any ESPN season is in. */
export function aggregateWithEspn(rows: PlayerLogRow[], espn: EspnSeasonTotals[], specs: StatSpec[]): Line {
  const line: Line = {};
  for (const spec of specs) {
    if (spec.rate) continue;
    let total = 0;
    // n counts rows with a value for THIS stat, so an average divides by it. The GP the page shows is
    // the profile's `played` count instead (NBA: a numeric MIN, even a sub-minute "0"). The two differ
    // only for a sub-minute row whose other cells are all "--": it counts as a game played but adds
    // nothing to (or divides into) an average. The page shows `played` for GP, `n` for the averages.
    let n = 0;
    let max: number | null = null;
    for (const r of rows) {
      const v = spec.value(r.stats);
      if (v === null) continue;
      total += v;
      n += 1;
      max = max === null ? v : Math.max(max, v);
    }
    let missing = false;
    for (const t of espn) {
      const part = espnPart(t, spec.key);
      if (part === null) {
        missing = true;
        continue;
      }
      total += part.total;
      n += part.n;
    }
    line[spec.key] = missing || n === 0 ? null : spec.agg === "avg" ? total / n : spec.agg === "max" ? max : total;
  }
  for (const spec of specs) {
    if (!spec.rate) continue;
    const num = line[spec.rate.num];
    const den = line[spec.rate.den];
    line[spec.key] = num === null || num === undefined || !den ? null : (spec.rate.pct ? 100 : 1) * (num / den);
  }
  return line;
}

export function aggregate(rows: PlayerLogRow[], specs: StatSpec[]): Line {
  return aggregateWithEspn(rows, [], specs);
}

export function formatStat(spec: StatSpec, v: number | null | undefined): string {
  if (v === null || v === undefined) return "–";
  const d = spec.decimals ?? 0;
  if (d > 0) return v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
  return Number.isInteger(v) ? v.toLocaleString("en-US") : v.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

/** The headline numbers on the career strip (and the downloadable player card): up to
 * three specs flagged `headline`, labelled "per game" for NBA per-game averages. */
export function headlineCareerStats(profile: PlayerProfile): { label: string; value: string }[] {
  const avg = profile.sport === "nba";
  return profile.profile.specs
    .filter((s) => s.headline)
    .map((s) => ({ label: avg && s.agg === "avg" ? `${s.title} per game` : s.title, value: formatStat(s, profile.career[s.key]) }));
}

export function record(rows: PlayerLogRow[]): Record3 {
  const r: Record3 = { w: 0, d: 0, l: 0 };
  for (const row of rows) {
    if (row.result === "W") r.w += 1;
    else if (row.result === "D") r.d += 1;
    else if (row.result === "L") r.l += 1;
  }
  return r;
}

/** Where a season's games figure comes from: ESPN's own count, the box-score rows stored here, or those rows
 * plus the players listed in games with no box score (no ESPN figure to go by). */
export type GamesSource = "espn" | "logged" | "listed";

/** Where a season's per-game line comes from: ESPN's own season row, or the box-score rows stored here. */
export type LineSource = "espn" | "box";

export interface SeasonLine {
  season: number;
  teams: { espn_id: string; name: string; slug: string; logo: string | null }[];
  /** The figure shown as GP: ESPN's games played (NFL regular season, NBA season with unrecorded games, when
   * stored), or the logged count plus the games with no box score. */
  games: number;
  gamesSource: GamesSource;
  /** The season's games with a stat line: the rows behind `line`. `games - recorded` is the games with no box score. */
  recorded: number;
  /** How many of the player's games this season have no box score (NBA only, else 0). They are in `games`
   * but in no `line`, split or W-L. */
  unrecorded: number;
  /** Null when `games` exceeds the logged games, so a W-L would contradict the games count. */
  record: Record3 | null;
  line: Line;
  /** Whether `line` is ESPN's own season row (NBA regular season where the game rows are short of ESPN's games)
   * or is built from the box-score rows. */
  lineSource: LineSource;
}

export interface Split {
  key: string;
  label: string;
  games: number;
  record: Record3;
  line: Line;
}

export interface OpponentSplit extends Split {
  slug: string;
  logo: string | null;
}

export interface Milestone {
  label: string;
  detail: string;
  game: PlayerLogRow | null;
}

export interface PlayerProfile {
  sport: PlayerSport;
  profile: SportProfile;
  /** Appearances only, most recent first. */
  rows: PlayerLogRow[];
  /** The sum of the seasons' displayed games when ESPN's figures were supplied or a season has games with no
   * box score, else the logged count. */
  games: number;
  /** The games with a stat line: the seasons' `recorded` plus the played rows with no season year. */
  recorded: number;
  /** The sum of the seasons' `unrecorded`: games with no box score. */
  unrecorded: number;
  /** Null when any season's record is null. */
  record: Record3 | null;
  /** True when at least one listed season's `games` is ESPN's figure. */
  gamesFromEspn: boolean;
  /** NBA figure (for NFL the field is not used): seasons with games beyond the recorded ones whose line is
   * still built from the box-score rows, because ESPN's season row was missing or failed a guard; plus one when a
   * listed game has no season year (it is in `games` but in no season line). */
  boxOnlyShort: number;
  career: Line;
  seasons: SeasonLine[];
  teams: SeasonLine["teams"];
  homeAway: Split[];
  byResult: Split[];
  opponents: OpponentSplit[];
  best: PlayerLogRow[];
  milestones: Milestone[];
  form: { row: PlayerLogRow; value: number | null }[];
  firstDate: string | null;
  lastDate: string | null;
}

function cmpRank(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const d = (b[i] ?? 0) - (a[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

/** `unrecorded` is the player's rows in games with no box score (NBA; empty for the others). A game with no box
 * score is still a game played, so it takes a place in the count behind "First game on record" and the "Nth game"
 * ordinals. The first game is that game even when it has no box score (its page says so); an Nth game with no box
 * score is left out, since a landmark pinned to it would claim a stat line. Every other milestone reads the games
 * with a stat line only.
 * `games` is the profile's games. When (NBA) it is beyond the rows the timeline holds, some games have no row at all
 * (ESPN listed a player who played with no athlete id, or a season is shown from ESPN's line), so the Nth game cannot
 * be located and every "Nth game" is skipped; the counts then say they are over the games with a box score. */
function milestonesFor(sport: PlayerSport, profile: SportProfile, chrono: PlayerLogRow[], unrecorded: PlayerLogRow[], games: number): Milestone[] {
  const out: Milestone[] = [];
  const timeline = unrecorded.length > 0 ? [...chrono, ...unrecorded].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)) : chrono;
  if (timeline.length === 0) return out;
  const unlocatable = sport === "nba" && games > timeline.length;
  const boxRowsOnly = sport === "nba" && games > chrono.length;
  const isUnrecorded = (r: PlayerLogRow) => unrecorded.includes(r);
  out.push({ label: `First ${profile.gamesLabel === "Apps" ? "appearance" : "game"} on record`, detail: "", game: timeline[0] });
  for (const n of [50, 100, 200, 300, 400, 500]) {
    if (!unlocatable && timeline.length >= n && !isUnrecorded(timeline[n - 1])) out.push({ label: `${ordinal(n)} ${profile.gamesLabel === "Apps" ? "appearance" : "game"}`, detail: "", game: timeline[n - 1] });
  }
  const landmark = (per: (r: PlayerLogRow) => number, steps: number[], unit: string) => {
    let running = 0;
    const targets = [...steps];
    let firstHit = false;
    for (const r of chrono) {
      const v = per(r);
      if (v <= 0) continue;
      if (!firstHit) {
        firstHit = true;
        out.push({ label: `First ${unit}`, detail: v > 1 ? `${v} in the game` : "", game: r });
      }
      running += v;
      while (targets.length && running >= targets[0]) {
        out.push({ label: `${ordinal(targets[0])} ${unit}`, detail: "", game: r });
        targets.shift();
      }
    }
  };
  if (sport === "soccer") {
    const keeper = profile.specs.some((s) => s.key === "cs");
    if (keeper) {
      landmark((r) => (cell(r.stats, "match", "GA") === 0 ? 1 : 0), [10, 25, 50, 100], "clean sheet");
    } else {
      landmark((r) => cell(r.stats, "match", "G") ?? 0, [10, 25, 50, 100, 150, 200], "goal");
      landmark((r) => cell(r.stats, "match", "A") ?? 0, [10, 25, 50, 100], "assist");
      const hatTricks = chrono.filter((r) => (cell(r.stats, "match", "G") ?? 0) >= 3);
      for (const r of hatTricks) out.push({ label: "Hat-trick", detail: `${cell(r.stats, "match", "G")} goals`, game: r });
    }
  } else if (sport === "nfl") {
    const count = (label: string, test: (r: PlayerLogRow) => boolean) => {
      const hits = chrono.filter(test);
      if (hits.length) out.push({ label, detail: `${hits.length} time${hits.length === 1 ? "" : "s"}, most recently`, game: hits[hits.length - 1] });
    };
    count("300-yard passing game", (r) => (cell(r.stats, "passing", "YDS") ?? 0) >= 300);
    count("4+ touchdown passes", (r) => (cell(r.stats, "passing", "TD") ?? 0) >= 4);
    count("100-yard rushing game", (r) => (cell(r.stats, "rushing", "YDS") ?? 0) >= 100);
    count("100-yard receiving game", (r) => (cell(r.stats, "receiving", "YDS") ?? 0) >= 100);
    count("Multi-sack game", (r) => (cell(r.stats, "defensive", "SACKS") ?? 0) >= 2);
    count("Two-interception game", (r) => (cell(r.stats, "interceptions", "INT") ?? 0) >= 2);
    count("50+ yard field goal", (r) => (cell(r.stats, "kicking", "LONG") ?? 0) >= 50);
  } else {
    const count = (label: string, test: (r: PlayerLogRow) => boolean) => {
      const hits = chrono.filter(test);
      if (hits.length) out.push({ label, detail: `${hits.length} time${hits.length === 1 ? "" : "s"}${boxRowsOnly ? " in games with a box score" : ""}, most recently`, game: hits[hits.length - 1] });
    };
    const dd = (r: PlayerLogRow) => ["PTS", "REB", "AST", "STL", "BLK"].filter((l) => (cell(r.stats, "box", l) ?? 0) >= 10).length;
    count("30-point game", (r) => (cell(r.stats, "box", "PTS") ?? 0) >= 30);
    count("40-point game", (r) => (cell(r.stats, "box", "PTS") ?? 0) >= 40);
    count("50-point game", (r) => (cell(r.stats, "box", "PTS") ?? 0) >= 50);
    count("Double-double", (r) => dd(r) >= 2);
    count("Triple-double", (r) => dd(r) >= 3);
  }
  return out;
}

/** The averages a meta or structured-data description may quote, or null when it must give the games alone. An NBA
 * profile quotes them only when no season is still short of ESPN's games on its box rows (`boxOnlyShort`) and it has a
 * career figure; a season shown from ESPN's line quotes ESPN's figures even with no game rows of its own. The other
 * sports quote whenever a game is recorded. */
export function metaFigures(profile: PlayerProfile, figures: string): string | null {
  if (profile.sport === "nba") return profile.boxOnlyShort === 0 && profile.career.pts !== null ? figures : null;
  return profile.recorded > 0 ? figures : null;
}

/** The column header (and its tooltip) for a games count. An NFL count that is not ESPN's is the number of
 * games with a stat line in the box scores, so it says so rather than passing for games played. */
export function gamesHeader(profile: PlayerProfile, fromEspn: boolean = profile.gamesFromEspn): { label: string; title?: string } {
  if (profile.sport !== "nfl" || fromEspn) return { label: profile.profile.gamesLabel };
  return { label: "Logged", title: "Games with a recorded stat line" };
}

/** The games in a season's or career's GP that ESPN published no box score for: `games - recorded`, never negative.
 * NBA only: an NFL figure above the log is players without a stat line (a lineman), which the NFL pages word
 * their own way, and soccer has no such games. */
export function noBoxScoreGames(sport: PlayerSport, games: number, recorded: number): number {
  return sport === "nba" ? Math.max(0, games - recorded) : 0;
}

/** NFL picks its columns from the rows it is given; the staged tables pass the regular-season rows
 * as `specRows` so every table for a player has the same columns. `reportedGames` (season year to ESPN's
 * games played) applies to the NFL, where ESPN's box scores omit players without a stat line so the log
 * undercounts games played, and to an NBA season with games ESPN published no box score for (`no_box_score`
 * rows: listed players with zeros, no stat line). Those games are counted as played but sit in no average:
 * the season's games are ESPN's figure when stored, else the logged games plus the listed ones.
 * `espnSeasons` (season year to ESPN's whole-season line; NBA regular season) replaces a season's line, games and career
 * share when ESPN counts more games than are logged and the row passes two guards: its points are at least the
 * recorded points, and a season with more than one team has ESPN games covering the logged and listed games. */
export function buildProfile(
  sport: PlayerSport,
  allRows: PlayerLogRow[],
  specRows: PlayerLogRow[] = allRows,
  reportedGames?: ReadonlyMap<number, number>,
  espnSeasons?: ReadonlyMap<number, EspnSeasonTotals>,
): PlayerProfile {
  const reported = sport === "nfl" || sport === "nba" ? reportedGames : undefined;
  const profile = sportProfile(sport, specRows);
  const newestFirst = (a: PlayerLogRow, b: PlayerLogRow) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0);
  const rows = allRows.filter(profile.played).sort(newestFirst);
  const chrono = [...rows].reverse();
  const unrecordedRows = allRows.filter((r) => r.no_box_score === true && !profile.played(r)).sort(newestFirst);
  const specs = profile.specs;

  const bySeason = new Map<number, { played: PlayerLogRow[]; unrecorded: PlayerLogRow[] }>();
  const inSeason = (season: number) => {
    if (!bySeason.has(season)) bySeason.set(season, { played: [], unrecorded: [] });
    return bySeason.get(season)!;
  };
  for (const r of rows) if (r.season_year !== null) inSeason(r.season_year).played.push(r);
  for (const r of unrecordedRows) if (r.season_year !== null) inSeason(r.season_year).unrecorded.push(r);
  const espnUsed = new Map<number, EspnSeasonTotals>();
  const seasons: SeasonLine[] = [...bySeason.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([season, { played: rs, unrecorded: us }]) => {
      const teams = new Map<string, SeasonLine["teams"][number]>();
      for (const r of [...rs, ...us].sort(newestFirst).reverse()) teams.set(r.team_espn_id, { espn_id: r.team_espn_id, name: r.team_name, slug: r.team_slug, logo: r.team_logo });
      const logged = rs.length;
      const espn = sport === "nba" ? espnSeasons?.get(season) : undefined;
      // Guard (a) sums the recorded points only when ESPN has a row for the season that counts more games than are logged.
      const useEspn = espn !== undefined && espn.games > logged && espn.pts >= rs.reduce((n, r) => n + (cell(r.stats, "box", "PTS") ?? 0), 0) && (teams.size <= 1 || espn.games >= logged + us.length);
      if (useEspn) {
        espnUsed.set(season, espn);
        return {
          season,
          teams: [...teams.values()],
          games: espn.games,
          gamesSource: "espn",
          recorded: logged,
          unrecorded: us.length,
          record: null,
          line: aggregateWithEspn([], [espn], specs),
          lineSource: "espn",
        };
      }
      // An NBA season is ESPN's figure only when it has games with no box score; NFL uses it for every season.
      const figure = sport === "nba" && us.length === 0 ? undefined : reported?.get(season);
      // A stat line proves the player played, so a stale stored figure never shows fewer games than the log.
      const games = figure === undefined ? logged + us.length : Math.max(figure, logged);
      return {
        season,
        teams: [...teams.values()],
        games,
        gamesSource: figure !== undefined ? "espn" : us.length > 0 ? "listed" : "logged",
        recorded: logged,
        unrecorded: us.length,
        record: games > logged ? null : record(rs),
        line: aggregate(rs, specs),
        lineSource: "box",
      };
    });
  const unrecorded = unrecordedRows.length;

  // Newest first, so the latest club leads; a team the player has only games with no box score for is still a team.
  const teams = new Map<string, SeasonLine["teams"][number]>();
  for (const r of unrecordedRows.length > 0 ? [...rows, ...unrecordedRows].sort(newestFirst) : rows) teams.set(r.team_espn_id, { espn_id: r.team_espn_id, name: r.team_name, slug: r.team_slug, logo: r.team_logo });

  const split = (key: string, label: string, rs: PlayerLogRow[]): Split => ({ key, label, games: rs.length, record: record(rs), line: aggregate(rs, specs) });
  const homeAway = [split("home", "Home", rows.filter((r) => r.is_home)), split("away", "Away", rows.filter((r) => !r.is_home))];
  const byResult = [
    split("w", "In wins", rows.filter((r) => r.result === "W")),
    ...(sport === "soccer" ? [split("d", "In draws", rows.filter((r) => r.result === "D"))] : []),
    split("l", "In losses", rows.filter((r) => r.result === "L")),
  ].filter((s) => s.games > 0);

  const byOpp = new Map<string, PlayerLogRow[]>();
  for (const r of rows) {
    if (!byOpp.has(r.opponent_espn_id)) byOpp.set(r.opponent_espn_id, []);
    byOpp.get(r.opponent_espn_id)!.push(r);
  }
  const opponents: OpponentSplit[] = [...byOpp.values()]
    .map((rs) => ({ ...split(rs[0].opponent_espn_id, rs[0].opponent_name, rs), slug: rs[0].opponent_slug, logo: rs[0].opponent_logo }))
    .sort((a, b) => b.games - a.games || a.label.localeCompare(b.label));

  const best = [...rows]
    .map((r) => ({ r, k: profile.rank(r) }))
    .filter(({ k }) => k.some((v) => v > 0))
    .sort((a, b) => cmpRank(a.k, b.k) || (a.r.date < b.r.date ? 1 : -1))
    .slice(0, 5)
    .map(({ r }) => r);

  // Rows with no season year are in no season line but are still in the career line and W-L, so they count here.
  const games = reported || espnUsed.size > 0 || unrecorded > 0 ? seasons.reduce((n, s) => n + s.games, 0) + [...rows, ...unrecordedRows].filter((r) => r.season_year === null).length : rows.length;

  return {
    sport,
    profile,
    rows,
    games,
    // Every played row is in a season or has no season year, and both are in the career line.
    recorded: rows.length,
    unrecorded,
    // A game with no box score and no season year is in no season, but the W-L still cannot cover it.
    record: seasons.some((s) => s.record === null) || unrecordedRows.some((r) => r.season_year === null) ? null : record(rows),
    gamesFromEspn: seasons.some((s) => s.gamesSource === "espn"),
    // A listed game with no season year is in `games` but in no season line, so it is a box-only shortfall of its own.
    boxOnlyShort: seasons.filter((s) => s.games > s.recorded && s.lineSource === "box").length + (unrecordedRows.some((r) => r.season_year === null) ? 1 : 0),
    // A season that shows ESPN's line is in the career as ESPN's totals over ESPN's games, not as its rows.
    career: aggregateWithEspn(rows.filter((r) => r.season_year === null || !espnUsed.has(r.season_year)), [...espnUsed.values()], specs),
    seasons,
    teams: [...teams.values()],
    homeAway,
    byResult,
    opponents,
    best,
    milestones: milestonesFor(sport, profile, chrono, unrecordedRows, games),
    form: rows.slice(0, 10).reverse().map((row) => ({ row, value: profile.form.value(row) })),
    firstDate: chrono[0]?.date ?? null,
    lastDate: rows[0]?.date ?? null,
  };
}

export interface StagedProfile {
  /** True for NBA and NFL: the games are split by stage. Soccer keeps one table. */
  split: boolean;
  /** Regular season (career strip, season table, splits, milestones); for soccer, every appearance. */
  regular: PlayerProfile;
  playoffs: PlayerProfile | null;
  playin: PlayerProfile | null;
  /** Every counted game (regular season, playoffs, play-in): best games and recent form. */
  counted: PlayerProfile;
  /** Every appearance, newest first, including games that are not counted: the game log. */
  log: PlayerLogRow[];
}

// NBA and NFL: ESPN's headline totals are regular-season games only, so the regular season, the
// playoffs and the play-in are separate tables. Preseason, All-Star and Cup-final games are in
// the game log but in no total.
// `reportedGames` is ESPN's games played per season (NFL and NBA); it feeds the regular-season profile alone, since
// the stored figure is regular season only: a playoff or play-in season with games that have no box score is listed.
// `espnSeasons` is ESPN's whole-season NBA line per season; it too feeds the NBA regular-season profile alone.
export function buildStagedProfile(
  sport: PlayerSport,
  allRows: PlayerLogRow[],
  reportedGames?: ReadonlyMap<number, number>,
  espnSeasons?: ReadonlyMap<number, EspnSeasonTotals>,
): StagedProfile {
  if (sport === "soccer") {
    const regular = buildProfile(sport, allRows);
    return { split: false, regular, playoffs: null, playin: null, counted: regular, log: regular.rows };
  }
  const of = (...stages: GameStage[]) => allRows.filter((r) => stages.includes(r.stage));
  const regularRows = of("regular", "other");
  const playoffRows = of("playoffs");
  const playinRows = of("playin");
  const countedRows = [...regularRows, ...playoffRows, ...playinRows];
  const specRows = regularRows.length > 0 ? regularRows : countedRows;
  const build = (rows: PlayerLogRow[]) => buildProfile(sport, rows, specRows);
  const regular = buildProfile(sport, regularRows, specRows, sport === "nfl" || sport === "nba" ? reportedGames : undefined, sport === "nba" ? espnSeasons : undefined);
  const playoffs = build(playoffRows);
  const playin = build(playinRows);
  return {
    split: true,
    regular,
    playoffs: playoffs.games > 0 ? playoffs : null,
    playin: playin.games > 0 ? playin : null,
    counted: build(countedRows),
    log: allRows.filter(regular.profile.played).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)),
  };
}

/** The games the player pages say ESPN published no box score for, in one figure: the same `games - recorded`
 * the † and the section notes use, summed over the regular season, playoffs and play-in, so the game log's
 * "not listed" line never prints a different number from the tables (the rows without a box score can be
 * fewer than ESPN's games played, and a stale ESPN figure below the log hides them). NBA only. */
export function unlistedGameCount(staged: StagedProfile): number {
  return [staged.regular, staged.playoffs, staged.playin].reduce((n, p) => n + (p ? noBoxScoreGames(p.sport, p.games, p.recorded) : 0), 0);
}

/** Goal minutes grouped into 15-minute bands (soccer), from stored match reports. */
export interface GoalBand {
  label: string;
  goals: number;
}

export function goalBands(clocks: string[]): GoalBand[] {
  const bands: GoalBand[] = ["1-15", "16-30", "31-45+", "46-60", "61-75", "76-90+", "Extra time"].map((label) => ({ label, goals: 0 }));
  for (const clock of clocks) {
    const minute = Number(clock.replace(/'/g, "").split("+")[0]);
    if (!Number.isFinite(minute)) continue;
    // Stoppage-time goals ("45'+2'", "90'+3'") belong to the half they closed.
    const idx = minute > 90 ? 6 : minute > 75 ? 5 : minute > 60 ? 4 : minute > 45 ? 3 : minute > 30 ? 2 : minute > 15 ? 1 : 0;
    bands[idx].goals += 1;
  }
  return bands;
}

const POSITION_NAMES: Record<PlayerSport, Record<string, string>> = {
  soccer: { G: "Goalkeeper", D: "Defender", M: "Midfielder", F: "Forward" },
  nba: { G: "Guard", F: "Forward", C: "Center", PG: "Point guard", SG: "Shooting guard", SF: "Small forward", PF: "Power forward" },
  nfl: {},
};

export function positionLabel(sport: PlayerSport | null, position: string | null | undefined): string | null {
  if (!position) return null;
  return (sport && POSITION_NAMES[sport][position]) ?? position;
}

/** Short facts for the profile header: position, number, age, height and weight. */
export function playerMeta(sport: PlayerSport | null, p: { position?: string | null; jersey?: string | null; age?: number | null; height?: string | null; weight?: string | null }): string[] {
  const out: string[] = [];
  const pos = positionLabel(sport, p.position);
  if (pos) out.push(pos);
  if (p.jersey) out.push(`#${p.jersey}`);
  if (p.age) out.push(`Age ${p.age}`);
  if (p.height) out.push(p.height);
  if (p.weight) out.push(p.weight);
  return out;
}
