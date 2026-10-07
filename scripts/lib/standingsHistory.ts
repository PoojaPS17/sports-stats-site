import type { Pool } from "pg";

/**
 * Copies each league's current-season standings into standings_history under today's UTC date and returns
 * the number of rows written. Only the newest season per league is copied: older seasons are finished
 * tables that never move. A second run the same day replaces that day's rows rather than adding to them.
 */
export async function snapshotStandings(pool: Pool): Promise<number> {
  const { rowCount } = await pool.query(
    `insert into standings_history (
       league, season, team_espn_id, conference, snapshot_date,
       rank, playoff_seed, wins, losses, draws, points, win_percent, games_behind
     )
     select s.league, s.season, s.team_espn_id, coalesce(s.conference, ''), (now() at time zone 'utc')::date,
            s.rank, s.playoff_seed, s.wins, s.losses, s.draws, s.points, s.win_percent, s.games_behind
     from standings s
     where s.season = (select max(season) from standings where league = s.league)
     on conflict (league, season, team_espn_id, conference, snapshot_date) do update set
       rank = excluded.rank, playoff_seed = excluded.playoff_seed, wins = excluded.wins,
       losses = excluded.losses, draws = excluded.draws, points = excluded.points,
       win_percent = excluded.win_percent, games_behind = excluded.games_behind`
  );
  return rowCount ?? 0;
}
