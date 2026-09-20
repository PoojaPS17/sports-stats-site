// The pure half of scripts/audit-player-totals.ts: how a season on the site is compared with the
// same season on ESPN. Nothing here opens a database connection or calls ESPN, so the tests can
// import it freely (the loader in season-stats.ts, which the CLI uses, opens the pool on import).
import { cell, type PlayerProfile, type PlayerSport } from "../../src/lib/playerProfile";

export type AuditLeague = "nba" | "nfl";

/** One season's regular-season figures: games played plus the compared numbers, keyed by name.
 * NBA: `ppg`. NFL: passing, rushing and receiving yards and touchdowns. */
export interface SeasonFigures {
  games: number | null;
  figures: Record<string, number | null>;
}

export type Verdict = "match" | "MISMATCH" | "no box scores" | "no ESPN row";

export interface Difference {
  field: string;
  site: number | null;
  espn: number | null;
}

export interface Comparison {
  verdict: Verdict;
  differences: Difference[];
}

/** Per-game averages are compared at one decimal (the precision ESPN publishes); everything else exactly. */
const ONE_DECIMAL_FIELDS = new Set(["ppg"]);

// The small epsilon keeps a value that is a half in exact arithmetic (27.05) from falling to the
// wrong side of the rounding because of binary floating point.
const oneDecimal = (v: number) => Math.round(v * 10 + 1e-9);

function differs(field: string, site: number | null, espn: number | null): boolean {
  // A figure ESPN does not list (a receiver has no passing category) is a zero, as it is on the site.
  const a = site ?? 0;
  const b = espn ?? 0;
  return ONE_DECIMAL_FIELDS.has(field) ? oneDecimal(a) !== oneDecimal(b) : a !== b;
}

/** Compares the site's regular-season line for one season with ESPN's headline line.
 * `match` and `MISMATCH` need both sides. `no box scores` (ESPN has the season, the database has no
 * regular-season game) is a coverage gap, never a match. `no ESPN row`: ESPN has nothing for it. */
export function compareSeason(site: SeasonFigures, espn: SeasonFigures | null): Comparison {
  const espnHasData = espn !== null && (espn.games !== null || Object.values(espn.figures).some((v) => v !== null));
  if (!espn || !espnHasData) return { verdict: "no ESPN row", differences: [] };
  if (!site.games) return { verdict: "no box scores", differences: [] };

  const differences: Difference[] = [];
  // ESPN's games played is only known where its categories carry it.
  if (espn.games !== null && site.games !== espn.games) differences.push({ field: "games", site: site.games, espn: espn.games });
  const fields = [...new Set([...Object.keys(site.figures), ...Object.keys(espn.figures)])];
  for (const field of fields) {
    const s = site.figures[field] ?? null;
    const e = espn.figures[field] ?? null;
    if (differs(field, s, e)) differences.push({ field, site: s, espn: e });
  }
  return { verdict: differences.length > 0 ? "MISMATCH" : "match", differences };
}

// ---------------------------------------------------------------------------
// Reading ESPN's payload
// ---------------------------------------------------------------------------
export interface StoredCategory {
  labels: string[];
  values: string[];
}

/** The shape `player_season_stats.categories` has: category name -> the season's labels and values. */
export type StoredCategories = Record<string, StoredCategory>;

// Same reading as numberAt in season-stats.ts (thousands separators stripped, non-numbers absent).
function figureAt(category: StoredCategory | undefined, label: string): number | null {
  if (!category) return null;
  const i = category.labels.indexOf(label);
  if (i === -1 || category.values[i] === undefined) return null;
  const n = Number(String(category.values[i]).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

const NFL_FIGURES: { field: string; category: string; label: string }[] = [
  { field: "passYds", category: "passing", label: "YDS" },
  { field: "passTd", category: "passing", label: "TD" },
  { field: "rushYds", category: "rushing", label: "YDS" },
  { field: "rushTd", category: "rushing", label: "TD" },
  { field: "recYds", category: "receiving", label: "YDS" },
  { field: "recTd", category: "receiving", label: "TD" },
];

/** ESPN's regular-season line for one season, read the way the loader reads it.
 * NBA: `averages` GP and PTS. NFL: GP (each category repeats the player's games played; the largest
 * is used), and passing, rushing and receiving YDS and TD. Null when the row has none of it. */
export function espnFigures(league: AuditLeague, categories: StoredCategories): SeasonFigures | null {
  if (league === "nba") {
    const averages = categories.averages;
    if (!averages) return null;
    return { games: figureAt(averages, "GP"), figures: { ppg: figureAt(averages, "PTS") } };
  }
  const cats = Object.values(categories);
  if (cats.length === 0) return null;
  const gps = cats.map((c) => figureAt(c, "GP")).filter((n): n is number => n !== null);
  const figures: Record<string, number | null> = {};
  for (const f of NFL_FIGURES) figures[f.field] = figureAt(categories[f.category], f.label);
  return { games: gps.length > 0 ? Math.max(...gps) : null, figures };
}

interface EspnStatRow {
  season?: { year?: number };
  teamSlug?: string;
  displayName?: string;
}

const isTotalsRow = (s: EspnStatRow) => /\btotals?\b/i.test(`${s.teamSlug ?? ""} ${s.displayName ?? ""}`);

/** A category from the live athlete /stats payload, narrowed to one season's row. A player who
 * changed teams has one row per team plus a "Totals" row that is ESPN's headline for the season;
 * the totals row is kept when there is one. (The loader's seasonRow takes the first row it finds,
 * which for a traded player is the first team's stint; the audit must not inherit that.) */
export function withTotalsRow<C extends { statistics?: EspnStatRow[] }>(category: C, year: number): C {
  const rows = (category.statistics ?? []).filter((s) => s.season?.year === year);
  const totals = rows.find(isTotalsRow);
  return { ...category, statistics: totals ? [totals] : rows };
}

export interface EspnCategory {
  name?: string;
  displayName?: string;
  labels?: string[];
  statistics?: (EspnStatRow & { stats?: string[] })[];
}

/** Every season of a live athlete /stats payload (from `minYear` on) as the stored-categories shape,
 * so a live read and a stored row go through the same `espnFigures`. `readRow` is the loader's
 * `seasonRow`, applied to the totals-preferring narrowing of each category; the category key is
 * the loader's (`name`, then `displayName`). */
export function seasonsFromPayload(
  categories: EspnCategory[],
  readRow: (category: EspnCategory, year: number) => StoredCategory | null,
  minYear: number
): Map<number, StoredCategories> {
  const years = new Set<number>();
  for (const category of categories) {
    for (const row of category.statistics ?? []) {
      const y = row.season?.year;
      if (typeof y === "number" && y >= minYear) years.add(y);
    }
  }
  const out = new Map<number, StoredCategories>();
  for (const year of years) {
    const stored: StoredCategories = {};
    for (const category of categories) {
      const row = readRow(withTotalsRow(category, year), year);
      if (row) stored[category.name ?? category.displayName ?? "stats"] = row;
    }
    out.set(year, stored);
  }
  return out;
}

// ---------------------------------------------------------------------------
// The site's side
// ---------------------------------------------------------------------------
/** The regular-season line per season that the player page shows. Games come from the profile's
 * season table (`regular` is regular-season games only; playoffs, play-in and excluded games are not
 * in it). NBA points per game is the table's own figure. The NFL totals are summed from the same
 * rows with the same cell reader the page's columns use, so they are the page's numbers even for a
 * category the page hides because it is a small part of the player's game (a receiver's one carry). */
export function siteSeasons(sport: PlayerSport, regular: PlayerProfile): Map<number, SeasonFigures> {
  const out = new Map<number, SeasonFigures>();
  for (const season of regular.seasons) {
    if (sport === "nba") {
      out.set(season.season, { games: season.games, figures: { ppg: season.line.pts ?? null } });
      continue;
    }
    const rows = regular.rows.filter((r) => r.season_year === season.season);
    const total = (category: string, label: string) => rows.reduce((sum, r) => sum + (cell(r.stats, category, label) ?? 0), 0);
    const figures: Record<string, number | null> = {};
    for (const f of NFL_FIGURES) figures[f.field] = total(f.category, f.label);
    out.set(season.season, { games: season.games, figures });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Command line
// ---------------------------------------------------------------------------
export interface Args {
  leagues: AuditLeague[];
  /** Read this many random players from ESPN now instead of the stored season rows. */
  live: number | null;
  /** Cap the number of players per league. */
  limit: number | null;
}

export const USAGE = "usage: tsx scripts/audit-player-totals.ts [nba|nfl] [--live N] [--limit N]   (N a positive whole number)";

export function parseArgs(argv: string[]): Args | { error: string } {
  let leagues: AuditLeague[] | null = null;
  let live: number | null = null;
  let limit: number | null = null;
  const positive = (flag: string, raw: string | undefined): number | { error: string } => {
    if (raw === undefined || !/^\d+$/.test(raw) || Number(raw) < 1) return { error: `${flag} needs a positive whole number, got ${raw === undefined ? "nothing" : `"${raw}"`}` };
    return Number(raw);
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--live" || arg === "--limit") {
      const n = positive(arg, argv[i + 1]);
      if (typeof n !== "number") return n;
      if (arg === "--live") live = n;
      else limit = n;
      i += 1;
    } else if (arg === "nba" || arg === "nfl") {
      if (leagues) return { error: "give at most one league" };
      leagues = [arg];
    } else {
      return { error: `unknown argument "${arg}"` };
    }
  }
  return { leagues: leagues ?? ["nba", "nfl"], live, limit };
}
