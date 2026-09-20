// Which of ESPN's per-season rows the season-stats loader stores. Pure: no database import, so the
// tests and the audit can use it without a connection (season-stats.ts opens the pool on import).

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
