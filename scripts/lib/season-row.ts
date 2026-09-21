// Which of ESPN's per-season rows the season-stats loader stores. Pure: no database import, so the
// tests and the audit can use it without a connection (season-stats.ts opens the pool on import).
import { POSTSEASON_PREFIX } from "../../src/lib/espnSeason";
import { HISTORY_START, type League } from "./espn";

/** One row of a category in ESPN's athlete /stats payload. */
export interface SeasonStatRow {
  season?: { year?: number };
  teamSlug?: string;
  displayName?: string;
  leagueSlug?: string;
  stats?: string[];
}

export interface SeasonCategory {
  labels?: string[];
  statistics?: SeasonStatRow[];
}

/** The relative window of the season-stats loader, `currentYear - SEASON_YEARS_BACK`, used only as the
 * fallback for a league with no `HISTORY_START` entry: `seasonWindowStart` is the rule, and it pins the
 * major leagues to 2015. The site's game history starts one season before `currentYear - 10`
 * (`backfill-games.ts` uses `currentYear - YEARS_BACK - 1`), so the window must reach that far too, or
 * those seasons have games but no stored ESPN games figure and fall back to the box-score count, which
 * misses games with no stat line. */
export const SEASON_YEARS_BACK = 11;

/** The first season the season-stats loader (and the audit's live read) keeps for a league. It is the
 * earlier of the relative window and the league's `HISTORY_START` pin, so a pinned league (NBA and NFL
 * from 2015) does not silently lose its oldest season when the current year advances, and stays in step
 * with the games history that starts there. */
export function seasonWindowStart(league: League, currentYear: number): number {
  return Math.min(currentYear - SEASON_YEARS_BACK, HISTORY_START[league] ?? Infinity);
}

/** ESPN's whole-season row for a player who changed teams: `teamSlug` like "2024-25 Totals" and
 * `displayName` "2024-25  Totals". */
export const isTotalsRow = (s: Pick<SeasonStatRow, "teamSlug" | "displayName">) => /\btotals?\b/i.test(`${s.teamSlug ?? ""} ${s.displayName ?? ""}`);

/**
 * The row a category contributes for one season, with its labels.
 *
 * A player who changed teams mid-season has one row per team plus a "Totals" row for the whole
 * season, which is ESPN's headline; that row is returned when there is one. Otherwise the first
 * row for the year.
 *
 * Soccer's stats endpoint is sport-wide, not league-scoped — a season row for the right year could
 * still be from a different league/competition entirely (e.g. a player's stint at a French club), so
 * `leagueSlug` narrows it to actual EPL rows. That path is unchanged: the first row of the year in
 * that league (a soccer row has no Totals row to prefer).
 */
export function seasonRow(category: SeasonCategory, seasonYear: number, leagueSlug?: string): { labels: string[]; values: string[] } | null {
  const rows = (category.statistics ?? []).filter((s) => s.season?.year === seasonYear && (!leagueSlug || s.leagueSlug === leagueSlug));
  const row = (leagueSlug ? undefined : rows.find(isTotalsRow)) ?? rows[0];
  if (!row) return null;
  return { labels: category.labels ?? [], values: row.stats ?? [] };
}

/** The categories of a `/stats?seasontype=3` response that are the player's POSTSEASON, or an empty list when he has none.
 *
 * Two answers look like "no postseason" and must not be confused with a failure or with data:
 * - ESPN answers a player with no postseason career with his REGULAR season and reports `seasontype` value 2 in its filters
 *   (measured on Bub Carrington, no playoffs: value 2, the regular rows). Storing those rows as postseason lines would show a
 *   whole regular season as the playoffs line of a player whose first playoff games are in progress, so only value 3 counts.
 * - A season with no playoff games has the categories with empty `statistics`; `postseasonRows` then adds no keys.
 * A body with no `categories` array (`getJson` returns any parseable body on a non-2xx status: `{"code":500,...}`) or with no
 * seasontype filter is not an answer at all: this throws, and the loader leaves the stored row alone. */
export function postseasonCategoriesOf(data: unknown): (SeasonCategory & { name?: string })[] {
  const body = data as { categories?: unknown; filters?: unknown } | null;
  if (!body || !Array.isArray(body.categories)) throw new Error("ESPN postseason stats response has no categories array");
  const filter = Array.isArray(body.filters) ? (body.filters as { name?: string; value?: unknown }[]).find((f) => f?.name === "seasontype") : undefined;
  if (filter === undefined) throw new Error("ESPN postseason stats response has no seasontype filter");
  return String(filter.value) === "3" ? (body.categories as (SeasonCategory & { name?: string })[]) : [];
}

/** The categories of ESPN's postseason payload (`/stats?seasontype=3`) that the site reads, stored beside the regular-season
 * ones in the same `categories` JSON under prefixed keys: `postseason_averages` and `postseason_totals`. A category with
 * no row for the season adds nothing (a season the player had no playoff games in has no postseason keys). */
const POSTSEASON_CATEGORIES = new Set(["averages", "totals"]);
export function postseasonRows(categories: (SeasonCategory & { name?: string })[], seasonYear: number): Record<string, { labels: string[]; values: string[] }> {
  const out: Record<string, { labels: string[]; values: string[] }> = {};
  for (const category of categories) {
    if (!category.name || !POSTSEASON_CATEGORIES.has(category.name)) continue;
    const row = seasonRow(category, seasonYear);
    if (row) out[`${POSTSEASON_PREFIX}${category.name}`] = row;
  }
  return out;
}

/**
 * ESPN's games played for one season of an NFL player, read from the `GP` column.
 *
 * The site's own game count comes from box-score rows, and ESPN's NFL box scores list only players
 * with a stat line, so it undercounts. ESPN's athlete /stats repeats the player's `GP` in every
 * category for a row's team, so this reads `GP` by its position in each category's labels.
 *
 * A traded player has a row per team plus, usually, a "Totals" row. That Totals row's `GP` is only
 * the first team's games, though its other columns are whole-season: Shiloh Keo 2016 (id 14122) has
 * Defense rows `denver-broncos` GP 3, `new-orleans-saints` GP 7 and `2016 Totals` GP 3, and his
 * game log has 10 regular-season games (3 + 7). So the answer is the sum over teams of that team's
 * largest `GP` across categories (a category lists only the teams the player has a stat line for),
 * and the Totals row is only a floor: the larger of the two is returned, so a Totals `GP` above the
 * sum still stands. Without a Totals row (NFL 2025 has players with per-team rows only) it is the
 * sum alone; without team rows it is the Totals `GP`. A single-team season is just that team's `GP`.
 * Null when no category has a readable `GP` for the year; a `GP` of 0 is returned as 0, for the
 * caller to decide.
 */
export function seasonGamesPlayed(categories: SeasonCategory[], seasonYear: number): number | null {
  let totalsGp: number | null = null;
  const teamGp = new Map<string, number>();

  for (const category of categories) {
    const gpIndex = (category.labels ?? []).indexOf("GP");
    if (gpIndex === -1) continue;
    for (const row of category.statistics ?? []) {
      if (row.season?.year !== seasonYear) continue;
      const raw = row.stats?.[gpIndex];
      if (raw === undefined || String(raw).trim() === "") continue;
      const gp = Number(String(raw).replace(/,/g, ""));
      if (!Number.isFinite(gp)) continue;
      if (isTotalsRow(row)) {
        totalsGp = totalsGp === null ? gp : Math.max(totalsGp, gp);
      } else {
        const team = row.teamSlug ?? row.displayName ?? "";
        teamGp.set(team, Math.max(teamGp.get(team) ?? gp, gp));
      }
    }
  }

  if (teamGp.size === 0) return totalsGp;
  let teamSum = 0;
  for (const gp of teamGp.values()) teamSum += gp;
  return totalsGp === null ? teamSum : Math.max(totalsGp, teamSum);
}
