// The pure half of scripts/audit-player-totals.ts: how a season on the site is compared with the
// same season on ESPN. Nothing here opens a database connection or calls ESPN, so the tests can
// import it freely (the loader in season-stats.ts, which the CLI uses, opens the pool on import).
import { espnSeasonTotals } from "../../src/lib/espnSeason";
import { cell, type PlayerProfile, type PlayerSport } from "../../src/lib/playerProfile";
import { seasonGamesPlayed, type SeasonStatRow } from "./season-row";

export type AuditLeague = "nba" | "nfl";

/** One season's regular-season figures: games played plus the compared numbers, keyed by name.
 * NBA: `ppg`. NFL: passing, rushing and receiving yards and touchdowns. */
export interface SeasonFigures {
  games: number | null;
  /** The site's side: where the page's games figure comes from, ESPN's stored games played, the logged
   * count (shown with a `*`, because no ESPN figure is stored for that season), or, for an NBA season with
   * games ESPN published no box score for and no stored figure, the games listed for the player. Only the
   * NFL comparison reads it. */
  gamesSource?: "espn" | "logged" | "listed";
  /** The site's side, NBA only, present only when the season has games ESPN published no box score for
   * (the page's `unrecorded` above 0) and the page shows the box-derived line, not ESPN's own (a season shown
   * from ESPN's row matches it by construction and has none). `listed` is the player's own count from our
   * rows, `recorded` plus the unrecorded games, before ESPN's figure is applied; `recorded` the games with a
   * stat line; `points` the points in those; `bestGame` the most in one of them (0 when there are none;
   * informational, the comparison does not read it). The season's `ppg` figure averages over `recorded`,
   * ESPN's over all of its games. */
  noBoxScore?: { listed: number; recorded: number; points: number; bestGame: number };
  figures: Record<string, number | null>;
}

export type Verdict =
  | "match"
  | "MISMATCH"
  | "no box scores"
  | "no ESPN row"
  | "games not verified"
  | "games short (no stat line)"
  | "partial (no box score)"
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

/** The most our listed count for a season (the player's games, with and without a box score) may differ
 * from ESPN's games played when ESPN published no box score for some of the games. In production, of 1,502
 * such player-seasons 1,294 were exact and the other 66 within 1 or 2 games: a game with no player rows at
 * all, or a listed player who did not play. */
export const MAX_LISTED_DRIFT = 2;

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
   * wrong) is a MISMATCH, and so is every other case, and every NBA games difference. NBA only: the
   * `noBoxScore` reading of a season (see `Verdict`) applies to `"nba"` alone. */
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
 *   partial (no box score)  NBA, a box-only season with games ESPN published no box score for
 *                       (`site.noBoxScore`; the page labels it as partial): the games agree (and our listed
 *                       count is within MAX_LISTED_DRIFT of ESPN's) and the only difference is the average,
 *                       which ESPN takes over all its games and the site over the recorded ones. Arithmetic
 *                       does not explain that average: how many points the games without a box score hold is
 *                       unknown, so there is no upper bound (a bound from the best recorded game is invalid
 *                       when only a few games are recorded). What is checked is the lower bound: ESPN's total
 *                       (ppg x games) must be at least the site's recorded points less tol (tol = 0.05 games,
 *                       ESPN publishes ppg to one decimal), else it is a MISMATCH; a season with nothing
 *                       missing must match. A season with no recorded game at all (the page shows no
 *                       average) is partial outright, the games checks still applying. A season the page
 *                       shows from ESPN's own row is not in this class (it matches by construction); the
 *                       independent check of those is ESPN's game log (see espn-gamelog.ts).
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

  // The games-without-a-box-score reading: NBA, and only against a season ESPN gives games played for.
  const noBox = options.league === "nba" && espn.games !== null ? site.noBoxScore : undefined;
  const figureDifferences: Difference[] = [];
  let partial: Difference | null = null;
  const fields = [...new Set([...Object.keys(site.figures), ...Object.keys(espn.figures)])];
  for (const field of fields) {
    const s = site.figures[field] ?? null;
    const e = espn.figures[field] ?? null;
    if (!differs(field, s, e)) continue;
    if (noBox && field === "ppg" && espn.games !== null && ppgPartial(noBox, espn.games, e ?? 0, s)) partial = { field, site: s, espn: e };
    else figureDifferences.push({ field, site: s, espn: e });
  }

  if (espn.games === null) {
    // ESPN's games played is absent for this season: the figures can still fail, but games can not pass.
    return figureDifferences.length > 0 ? { verdict: "MISMATCH", differences: figureDifferences } : { verdict: "games not verified", differences: [] };
  }
  // Our own count of the player's games for the season (the page shows ESPN's figure, which equals it by
  // construction) must be close to ESPN's, or the shortfall is not just games without a box score.
  const drift: Difference[] = noBox && Math.abs(noBox.listed - espn.games) > MAX_LISTED_DRIFT ? [{ field: "games (listed)", site: noBox.listed, espn: espn.games }] : [];
  if (site.games === espn.games) {
    const real = [...drift, ...figureDifferences];
    if (real.length > 0) return { verdict: "MISMATCH", differences: real };
    return partial ? { verdict: "partial (no box score)", differences: [partial] } : { verdict: "match", differences: [] };
  }
  const games: Difference = { field: "games", site: site.games, espn: espn.games };
  if (options.league === "nfl" && site.games < espn.games && figureDifferences.length === 0 && site.gamesSource === "logged") {
    return { verdict: "games short (no stat line)", differences: [games] };
  }
  return { verdict: "MISMATCH", differences: [games, ...drift, ...figureDifferences] };
}

/** Whether a differing ppg is one a season with games without a box score leaves open (a partial season, not a
 * contradiction). ESPN's ppg covers all `espnGames`, the site's average only the `recorded` ones, so ESPN's total
 * (ppg x games) is the recorded points plus what the missing games scored, which nothing here knows: the only
 * bound is the lower one, ESPN's total at least the recorded points (less `tol`, for ESPN's one-decimal
 * rounding). Nothing missing leaves nothing open. A season with nothing recorded has no average on the page
 * (`sitePpg` null), so whatever ESPN publishes is not a figure the site contradicts; an average shown for a
 * season with nothing recorded is contradictory data and stays a difference. */
function ppgPartial(noBox: NonNullable<SeasonFigures["noBoxScore"]>, espnGames: number, espnPpg: number, sitePpg: number | null): boolean {
  const missingGames = espnGames - noBox.recorded;
  if (missingGames <= 0) return false;
  if (noBox.recorded === 0) return sitePpg === null;
  const tol = 0.05 * espnGames;
  return espnPpg * espnGames - noBox.points >= -tol;
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
 * NBA: `averages` GP and PTS, and games: the row's GP, or the loader's `gamesPlayed` when that is above it (a stint
 * row's GP is below the season's, and the page then does not show the row's line). NFL: passing, rushing and receiving YDS and TD,
 * and games: the loader's own figure `gamesPlayed` (player_season_stats.games_played, or
 * `seasonGamesPlayed` on a live payload) when there is one, else the largest GP the categories give
 * (each category repeats the player's games played, but a traded player's first-stint row is one stint).
 * Null when the row has none of it. */
export function espnFigures(league: AuditLeague, categories: StoredCategories, gamesPlayed?: number | null): SeasonFigures | null {
  if (league === "nba") {
    const averages = categories.averages;
    if (!averages) return null;
    // The row's GP can be one stint's (or the first team's); the loader's figure, when above it, is the whole season's.
    const rowGames = figureAt(averages, "GP");
    const games = typeof gamesPlayed === "number" && gamesPlayed > (rowGames ?? 0) ? gamesPlayed : rowGames;
    return { games, figures: { ppg: figureAt(averages, "PTS") } };
  }
  const cats = Object.values(categories);
  if (cats.length === 0) return null;
  const gps = cats.map((c) => figureAt(c, "GP")).filter((n): n is number => n !== null);
  const figures: Record<string, number | null> = {};
  for (const f of NFL_FIGURES) figures[f.field] = figureAt(categories[f.category], f.label);
  const fromCategories = gps.length > 0 ? Math.max(...gps) : null;
  return { games: typeof gamesPlayed === "number" && gamesPlayed > 0 ? gamesPlayed : fromCategories, figures };
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

/** The games played `seasonGamesPlayed` reads from each season of a live payload (from `minYear` on), for the same
 * years `seasonsFromPayload` returns: the larger of the Totals row's GP and the sum of a traded player's teams' GPs
 * (a Totals row's GP can be only the first team's, so it is just a floor). It is what the loader stores as
 * games_played for the NFL; the NBA loader stores the row's own GP instead, so in live mode this figure can be above an
 * NBA row's GP, and `espnFigures` then reports it as ESPN's games, which flags a first-team-only Totals GP for the NBA
 * as well. Null where there is none (no readable GP, or a GP of 0, which the loader drops), so the caller falls back to
 * the categories' GP. */
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
 * logged count). NBA points per game is the table's own figure, an average over the games with a stat
 * line; an NBA season with games ESPN published no box score for (`unrecorded` above 0) that the page shows
 * from its box rows (`lineSource` "box"; a season shown from ESPN's own row has nothing to compare and carries
 * none) also carries `noBoxScore`, summed from the same rows with the cell reader the page uses (a blank PTS is 0). The NFL
 * totals are summed from the same rows with the same cell reader the page's columns use, so they are the
 * page's numbers even for a category the page hides because it is a small part of the player's game (a
 * receiver's one carry). */
export function siteSeasons(sport: PlayerSport, regular: PlayerProfile): Map<number, SeasonFigures> {
  const out = new Map<number, SeasonFigures>();
  for (const season of regular.seasons) {
    const rows = regular.rows.filter((r) => r.season_year === season.season);
    if (sport === "nba") {
      const points = rows.map((r) => cell(r.stats, "box", "PTS") ?? 0);
      out.set(season.season, {
        games: season.games,
        figures: { ppg: season.line.pts ?? null },
        // A season that shows ESPN's own line has no recorded-versus-missing gap to explain: its figures are ESPN's.
        ...(season.unrecorded > 0 && season.lineSource !== "espn" && {
          noBoxScore: { listed: season.recorded + season.unrecorded, recorded: season.recorded, points: points.reduce((a, b) => a + b, 0), bestGame: Math.max(0, ...points) },
        }),
      });
      continue;
    }
    const total = (category: string, label: string) => rows.reduce((sum, r) => sum + (cell(r.stats, category, label) ?? 0), 0);
    const figures: Record<string, number | null> = {};
    for (const f of NFL_FIGURES) figures[f.field] = total(f.category, f.label);
    out.set(season.season, { games: season.games, gamesSource: season.gamesSource, figures });
  }
  return out;
}

/** Whether ESPN's stored season row is one the site cannot use though ESPN counts more games than the site has
 * logged: `averages.GP` is above `loggedGames` (the games with a stat line) but `espnSeasonTotals` rejects the
 * row (its points fail `pts = 2 x FGM + 3PM + FTM`, a made count exceeds its attempts, its averages' PTS is not the
 * totals' PTS over GP to within 0.06, or a figure is missing).
 * The season then falls back to the box-derived line, silently short of ESPN's games; this is how the audit
 * lists it. A row with no readable GP, or whose GP is not above the logged games, is not flagged. */
export function unusableEspnRow(categories: unknown, loggedGames: number): boolean {
  if (typeof categories !== "object" || categories === null) return false;
  const averages = (categories as { averages?: StoredCategory }).averages;
  const games = figureAt(averages, "GP");
  return games !== null && games > loggedGames && espnSeasonTotals(categories) === null;
}

/** A season the profile has no regular-season games for (none stored, or playoffs only). */
export function siteSeasonOrEmpty(seasons: Map<number, SeasonFigures>, season: number): SeasonFigures {
  return seasons.get(season) ?? { games: 0, figures: {} };
}

/** Seasons in which the player's regular-season games span more than one team. A stored row for such a
 * season may still be one team's stint (rows loaded before the loader took ESPN's Totals row) or, for
 * games, only the first team's (rows loaded before the loader summed the teams' games), so findings
 * there are tagged. */
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
  /** NBA: also fetch ESPN's game log for every season the site shows from ESPN's own row and check it against
   * that row (games and points). Off unless asked: one ESPN request per season. */
  gamelog: boolean;
}

export const MAX_COUNT = 100000;

export const USAGE = [
  "usage: tsx scripts/audit-player-totals.ts [nba|nfl] [--live N] [--limit N] [--strict] [--gamelog]   (N a whole number from 1 to 100000)",
  "  --live N --limit M samples the N random players from the first M players by ESPN id.",
  "  --strict also exits 1 on 'games not verified' and NFL 'games short (no stat line)'",
  "  (the page shows the logged count because no ESPN games figure is stored for the season).",
  "  NBA 'partial (no box score)' (a box-only season: ESPN published no box score for some of the team's games,",
  "  so its average cannot be checked; ESPN's points total is at least the recorded points) is listed and never",
  "  fails the run, --strict included.",
  "  --gamelog (NBA) also fetches ESPN's game log, one request per season, for every season the page shows from",
  "  ESPN's own row, and checks its games and points against that row (honours --limit): 'confirmed', 'ESPN",
  "  internal' (within 3 games; listed, never fails), 'log incomplete' (the log is more than 3 games short of the",
  "  row and its points do not exceed the row's, so it is missing games; listed, never fails) or MISMATCH",
  "  (fails the run, as does a game log that could not be read). A season ESPN has no regular-season game log for",
  "  (its box scores are blank for the Bulls' and Pelicans' 2015-2018 games) is listed as 'ESPN has no log' and",
  "  never fails the run, unless every season checked was like that (a wholesale change on ESPN's side).",
].join("\n");

export function parseArgs(argv: string[]): Args | { error: string } {
  let leagues: AuditLeague[] | null = null;
  let live: number | null = null;
  let limit: number | null = null;
  let strict = false;
  let gamelog = false;
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
    } else if (arg === "--gamelog") {
      gamelog = true;
    } else if (arg === "nba" || arg === "nfl") {
      if (leagues) return { error: "give at most one league" };
      leagues = [arg];
    } else {
      return { error: `unknown argument "${arg}"` };
    }
  }
  return { leagues: leagues ?? ["nba", "nfl"], live, limit, strict, gamelog };
}
