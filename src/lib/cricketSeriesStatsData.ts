import { cache } from "react";
import { pool } from "./db";
import { normalizeStage } from "./stage";
import { aggregateSeriesStats, type CricketSeriesStats, type SeriesStatRow } from "./cricketSeriesStats";

/**
 * The leaders of a series from its stored per-match figures (cricket_series_player_stats, written by the
 * series top-up). Read once per request: the page and its metadata both ask. Empty lists for a series with
 * nothing stored yet, or one SportsDB archives under a competition (its hub has the leaders).
 */
export const getCricketSeriesStats = cache(async (seriesEspnId: string): Promise<CricketSeriesStats> => {
  const { rows } = await pool.query<Omit<SeriesStatRow, "stage"> & { description: string | null }>(
    `select s.match_espn_id, s.player_espn_id, s.player_name, s.team_espn_id, s.stats, m.description
     from cricket_series_player_stats s
     left join cricket_series_matches m on m.espn_id = s.match_espn_id
     where s.series_espn_id = $1`,
    [seriesEspnId]
  );
  return aggregateSeriesStats(rows.map(({ description, ...r }) => ({ ...r, stage: normalizeStage(description) })));
});
