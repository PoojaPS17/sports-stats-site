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
