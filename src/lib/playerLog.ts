import type { Pool } from "pg";
import type { League } from "./leagues";
import type { PlayerLogRow } from "./playerProfile";

/** Every completed box-score row for a player with the game's context from the player's side.
 * Takes the connection so the read-only audit script can use its own pool. */
export async function fetchPlayerLog(db: Pick<Pool, "query">, league: League, playerEspnId: string): Promise<PlayerLogRow[]> {
  const { rows } = await db.query(
    `select pgs.game_espn_id, g.date, g.season_year, g.round, g.week, g.stage, g.season_type, g.competition_type, pgs.stats,
            (g.home_team_espn_id = pgs.team_espn_id) as is_home,
            pgs.team_espn_id, tm.name as team_name, tm.slug as team_slug, tm.abbreviation as team_abbr, tm.logo_url as team_logo,
            op.espn_id as opponent_espn_id, op.name as opponent_name, op.slug as opponent_slug, op.abbreviation as opponent_abbr, op.logo_url as opponent_logo,
            case when g.home_team_espn_id = pgs.team_espn_id then g.home_score else g.away_score end as team_score,
            case when g.home_team_espn_id = pgs.team_espn_id then g.away_score else g.home_score end as opponent_score,
            case
              when not g.completed or g.home_score is null or g.away_score is null then null
              when g.home_score = g.away_score then 'D'
              when (g.home_team_espn_id = pgs.team_espn_id) = (g.home_score > g.away_score) then 'W'
              else 'L'
            end as result
     from player_game_stats pgs
     join games g on g.league = pgs.league and g.espn_id = pgs.game_espn_id
     join teams tm on tm.league = g.league and tm.espn_id = pgs.team_espn_id
     join teams op on op.league = g.league and op.espn_id = case when g.home_team_espn_id = pgs.team_espn_id then g.away_team_espn_id else g.home_team_espn_id end
     where pgs.league = $1 and pgs.player_espn_id = $2 and g.completed
     order by g.date desc`,
    [league, playerEspnId]
  );
  return rows;
}
