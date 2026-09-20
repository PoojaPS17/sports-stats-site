// The pure half of scripts/audit-player-totals.ts: how a season on the site is compared with the
// same season on ESPN. Nothing here opens a database connection or calls ESPN, so the tests can
// import it freely (the loader in season-stats.ts, which the CLI uses, opens the pool on import).
import { cell, type PlayerProfile, type PlayerSport } from "../../src/lib/playerProfile";
import { seasonGamesPlayed, type SeasonStatRow } from "./season-row";

export type AuditLeague = "nba" | "nfl";

/** One season's regular-season figures: games played plus the compared numbers, keyed by name.
 * NBA: `ppg`. NFL: passing, rushing and receiving yards and touchdowns. */
export interface SeasonFigures {
  games: number | null;
  /** The site's side, NFL only: where the page's games figure comes from, ESPN's stored games played or
   * the logged count (shown with a `*`, because no ESPN figure is stored for that season). */
  gamesSource?: "espn" | "logged";
  figures: Record<string, number | null>;
}

export type Verdict =
  | "match"
  | "MISMATCH"
  | "no box scores"
  | "no ESPN row"
  | "games not verified"
  | "games short (no stat line)"
  | "nothing to compare";

export interface Difference {
  field: string;
  site: number | null;
  /** ESPN's value; null when ESPN has no row (or does not list the figure). */
  espn: number | null;
}

export interface Comparison {
  verdict: Verdict;
  differences: Difference[];
}

/** Per-game averages are compared at one decimal (the precision ESPN publishes); everything else exactly. */
const ONE_DECIMAL_FIELDS = new Set(["ppg"]);

// The very formatter the player page uses for a one-decimal figure (formatStat in playerProfile.ts:
// toLocaleString with one fraction digit), so the audit rounds exactly as the page displays: 27.05 and
// 27.15 show as 27.1 and 27.2 although 27.15 is 27.149999... in binary.
const oneDecimal = new Intl.NumberFormat("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1, useGrouping: false });

function differs(field: string, site: number | null, espn: number | null): boolean {
  // A figure ESPN does not list (a receiver has no passing category) is a zero, as it is on the site.
  const a = site ?? 0;
  const b = espn ?? 0;
  return ONE_DECIMAL_FIELDS.has(field) ? oneDecimal.format(a) !== oneDecimal.format(b) : a !== b;
}

export interface CompareOptions {
  /** NFL only: fewer site games than ESPN with every figure equal is "games short (no stat line)",
   * not a mismatch, when the page shows the logged count because no ESPN games figure is stored for
   * the season (`site.gamesSource === "logged"`; a player who played without a line in the box score
   * is in ESPN's GP and not in the log). Fewer games with a stored ESPN figure (`"espn"`, stale or
   * wrong) is a MISMATCH, and so is every other case, and every NBA games difference. */
  league?: AuditLeague;
  /** ESPN is authoritative for this season (a live read inside the loader's window): a season where
   * the site has regular-season games and ESPN has no row is a MISMATCH, not a listed class. */
  requireEspnRow?: boolean;
}

/** Compares the site's regular-season line for one season with ESPN's headline line.
 *   match               both sides agree (games and every figure)
 *   MISMATCH            games or a figure differ (differences carry both values)
 *   no box scores       ESPN has the season, the site has no regular-season game: a coverage gap
 *   no ESPN row         the site has regular-season games, ESPN has nothing (a MISMATCH under requireEspnRow)
 *   games not verified  every figure agrees but ESPN's games played is absent, so games are unchecked
 *   games short (no stat line)  NFL: site games below ESPN's GP, every figure equal, and the page shows
 *                       the logged count because no ESPN games figure is stored for the season
 *   nothing to compare  neither side has anything for the season
 * Only `match` is a match. */
export function compareSeason(site: SeasonFigures, espn: SeasonFigures | null, options: CompareOptions = {}): Comparison {
  const espnHasData = espn !== null && (espn.games !== null || Object.values(espn.figures).some((v) => v !== null));
  if (!espn || !espnHasData) {
    if (!site.games) return { verdict: "nothing to compare", differences: [] };
    if (options.requireEspnRow) return { verdict: "MISMATCH", differences: [{ field: "ESPN row", site: site.games, espn: null }] };
    return { verdict: "no ESPN row", differences: [] };
  }
  if (!site.games) return { verdict: "no box scores", differences: [] };

  const figureDifferences: Difference[] = [];
  const fields = [...new Set([...Object.keys(site.figures), ...Object.keys(espn.figures)])];
  for (const field of fields) {
    const s = site.figures[field] ?? null;
    const e = espn.figures[field] ?? null;
    if (differs(field, s, e)) figureDifferences.push({ field, site: s, espn: e });
  }

  if (espn.games === null) {
    // ESPN's games played is absent for this season: the figures can still fail, but games can not pass.
    return figureDifferences.length > 0 ? { verdict: "MISMATCH", differences: figureDifferences } : { verdict: "games not verified", differences: [] };
  }
  if (site.games === espn.games) {
    return figureDifferences.length > 0 ? { verdict: "MISMATCH", differences: figureDifferences } : { verdict: "match", differences: [] };
  }
  const games: Difference = { field: "games", site: site.games, espn: espn.games };
  if (options.league === "nfl" && site.games < espn.games && figureDifferences.length === 0 && site.gamesSource === "logged") {
    return { verdict: "games short (no stat line)", differences: [games] };
  }
  return { verdict: "MISMATCH", differences: [games, ...figureDifferences] };
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
 * NBA: `averages` GP and PTS (`gamesPlayed` is ignored). NFL: passing, rushing and receiving YDS and TD,
 * and games: the loader's own figure `gamesPlayed` (player_season_stats.games_played, or
 * `seasonGamesPlayed` on a live payload) when there is one, else the largest GP the categories give
 * (each category repeats the player's games played, but a traded player's first-stint row is one stint).
 * Null when the row has none of it. */
export function espnFigures(league: AuditLeague, categories: StoredCategories, gamesPlayed?: number | null): SeasonFigures | null {
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
  const fromCategories = gps.length > 0 ? Math.max(...gps) : null;
  return { games: typeof gamesPlayed === "number" ? gamesPlayed : fromCategories, figures };
}

export interface EspnCategory {
  name?: string;
  displayName?: string;
  labels?: string[];
  statistics?: SeasonStatRow[];
}

function payloadYears(categories: EspnCategory[], minYear: number): Set<number> {
  const years = new Set<number>();
  for (const category of categories) {
    for (const row of category.statistics ?? []) {
      const y = row.season?.year;
      if (typeof y === "number" && y >= minYear) years.add(y);
    }
  }
  return years;
}

/** Every season of a live athlete /stats payload (from `minYear` on) as the stored-categories shape,
 * so a live read and a stored row go through the same `espnFigures`. `readRow` is the loader's
 * `seasonRow` (which takes ESPN's Totals row for a traded player); the category key is the
 * loader's (`name`, then `displayName`). */
export function seasonsFromPayload(
  categories: EspnCategory[],
  readRow: (category: EspnCategory, year: number) => StoredCategory | null,
  minYear: number
): Map<number, StoredCategories> {
  const years = payloadYears(categories, minYear);
  const out = new Map<number, StoredCategories>();
  for (const year of years) {
    const stored: StoredCategories = {};
    for (const category of categories) {
      const row = readRow(category, year);
      if (row) stored[category.name ?? category.displayName ?? "stats"] = row;
    }
    out.set(year, stored);
  }
  return out;
}

/** The NFL games played the loader would store for each season of a live payload (from `minYear` on),
 * for the same years `seasonsFromPayload` returns: `seasonGamesPlayed`, which takes a traded player's
 * Totals row, or sums the teams when there is none. Null where the loader stores none (no readable GP,
 * or a GP of 0, which it drops), so the caller falls back to the categories' GP. */
export function gamesPlayedFromPayload(categories: EspnCategory[], minYear: number): Map<number, number | null> {
  const out = new Map<number, number | null>();
  for (const year of payloadYears(categories, minYear)) {
    const games = seasonGamesPlayed(categories, year);
    out.set(year, games !== null && games > 0 ? games : null);
  }
  return out;
}

// ---------------------------------------------------------------------------
// The site's side
// ---------------------------------------------------------------------------
/** The regular-season line per season that the player page shows. Games come from the profile's
 * season table (`regular` is regular-season games only; playoffs, play-in and excluded games are not
 * in it); for the NFL the profile must be built with the same ESPN games map the page uses, and each
 * season carries its `gamesSource` ("espn" when ESPN's stored figure is shown, "logged" when it is the
 * logged count). NBA points per game is the table's own figure. The NFL totals are summed from the same
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
    out.set(season.season, { games: season.games, gamesSource: season.gamesSource, figures });
  }
  return out;
}

/** A season the profile has no regular-season games for (none stored, or playoffs only). */
export function siteSeasonOrEmpty(seasons: Map<number, SeasonFigures>, season: number): SeasonFigures {
  return seasons.get(season) ?? { games: 0, figures: {} };
}

/** Seasons in which the player's regular-season games span more than one team. A stored row for such a
 * season may still be one team's stint (rows loaded before the loader took ESPN's Totals row), so
 * findings there are tagged. */
export function tradedSeasons(regular: PlayerProfile): Set<number> {
  return new Set(regular.seasons.filter((s) => s.teams.length > 1).map((s) => s.season));
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
  /** Also fail (exit 1) on "games not verified" and "games short (no stat line)" (the page shows the
   * logged count because no ESPN games figure is stored for the season). */
  strict: boolean;
}

export const MAX_COUNT = 100000;

export const USAGE = [
  "usage: tsx scripts/audit-player-totals.ts [nba|nfl] [--live N] [--limit N] [--strict]   (N a whole number from 1 to 100000)",
  "  --live N --limit M samples the N random players from the first M players by ESPN id.",
  "  --strict also exits 1 on 'games not verified' and NFL 'games short (no stat line)'",
  "  (the page shows the logged count because no ESPN games figure is stored for the season).",
].join("\n");

export function parseArgs(argv: string[]): Args | { error: string } {
  let leagues: AuditLeague[] | null = null;
  let live: number | null = null;
  let limit: number | null = null;
  let strict = false;
  const count = (flag: string, raw: string | undefined): number | { error: string } => {
    if (raw === undefined || !/^\d+$/.test(raw) || Number(raw) < 1) return { error: `${flag} needs a positive whole number, got ${raw === undefined ? "nothing" : `"${raw}"`}` };
    if (Number(raw) > MAX_COUNT) return { error: `${flag} must be at most ${MAX_COUNT}, got ${raw}` };
    return Number(raw);
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--live" || arg === "--limit") {
      const n = count(arg, argv[i + 1]);
      if (typeof n !== "number") return n;
      if (arg === "--live") live = n;
      else limit = n;
      i += 1;
    } else if (arg === "--strict") {
      strict = true;
    } else if (arg === "nba" || arg === "nfl") {
      if (leagues) return { error: "give at most one league" };
      leagues = [arg];
    } else {
      return { error: `unknown argument "${arg}"` };
    }
  }
  return { leagues: leagues ?? ["nba", "nfl"], live, limit, strict };
}
