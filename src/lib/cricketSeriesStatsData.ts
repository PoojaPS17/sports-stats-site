import { cache } from "react";
import { pool } from "./db";
import { normalizeStage } from "./stage";
import { aggregateSeriesStats, type CricketSeriesStats, type SeriesStatRow } from "./cricketSeriesStats";

/**
 * The rows the leaders are summed from, one source per match (so a match never counts twice):
 *  - a match with a scorecard archived in `games` (Tests, ODIs, T20Is, the IPL, the World Cups...) reads its figures from
 *    player_game_stats under the competition that holds it;
 *  - any other match reads cricket_series_player_stats (written by the series top-up), and so does an archived match
 *    that has no player_game_stats rows yet.
 * The scope: a tour that mixes official internationals (ESPN's international_class_id other than 0: Test, ODI, T20I,
 * women's and youth internationals) with warm-ups against county, Lions or Prime Minister's XIs counts the internationals
 * only; a series with none (a domestic league, an A-team tour) counts every match.
 * `$1` is the series id.
 */
export const SERIES_STAT_ROWS_SQL = `
  with ms as (
    select m.espn_id, m.description, coalesce(m.international_class_id, '0') <> '0' as official,
           (select g.league from games g where g.espn_id = m.espn_id and g.league = any(m.league_candidates)
              order by array_position(m.league_candidates, g.league) limit 1) as sc_league
    from cricket_series_matches m
    where m.series_espn_id = $1
  ), scope as (
    select ms.*, ms.sc_league is not null and exists (select 1 from player_game_stats p where p.league = ms.sc_league and p.game_espn_id = ms.espn_id) as has_archive
    from ms
    where ms.official or not exists (select 1 from ms o where o.official)
  )
  select scope.espn_id as match_espn_id, p.player_espn_id, coalesce(pl.name, p.player_espn_id) as player_name, coalesce(p.team_espn_id, '') as team_espn_id, p.stats, scope.description, scope.official
  from scope
  join player_game_stats p on p.league = scope.sc_league and p.game_espn_id = scope.espn_id
  left join players pl on pl.league = p.league and pl.espn_id = p.player_espn_id
  where scope.has_archive
  union all
  select scope.espn_id, s.player_espn_id, s.player_name, s.team_espn_id, s.stats, scope.description, scope.official
  from scope
  join cricket_series_player_stats s on s.match_espn_id = scope.espn_id and s.series_espn_id = $1
  where not scope.has_archive`;

/**
 * The leaders of a series, summed from its scorecards: the archived ones in player_game_stats and the top-up's in
 * cricket_series_player_stats (see SERIES_STAT_ROWS_SQL for which wins and which matches count). Read once per request:
 * the page and its metadata both ask. Empty lists for a series with nothing stored yet, or one SportsDB archives under
 * a competition (its hub has the leaders).
 */
export const getCricketSeriesStats = cache(async (seriesEspnId: string): Promise<CricketSeriesStats> => {
  const { rows } = await pool.query<Omit<SeriesStatRow, "stage"> & { description: string | null; official: boolean }>(SERIES_STAT_ROWS_SQL, [seriesEspnId]);
  const stats = aggregateSeriesStats(rows.map((r) => ({ match_espn_id: r.match_espn_id, player_espn_id: r.player_espn_id, player_name: r.player_name, team_espn_id: r.team_espn_id, stats: r.stats, stage: normalizeStage(r.description) })));
  return { ...stats, officialOnly: rows.length > 0 && rows.every((r) => r.official) && (await seriesHasUncountedMatches(seriesEspnId)) };
});

/** True when the series lists matches the leaders leave out (warm-ups beside official internationals). */
async function seriesHasUncountedMatches(seriesEspnId: string): Promise<boolean> {
  const { rows } = await pool.query(
    `select bool_or(coalesce(international_class_id, '0') = '0') as skipped from cricket_series_matches where series_espn_id = $1`,
    [seriesEspnId]
  );
  return rows[0]?.skipped === true;
}
