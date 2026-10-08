// Which team a player page names. players.team_espn_id takes the team of the latest roster row the importers saw,
// and for an international cricketer that can be a one-off side: Rashid Khan's last T20I row was for the ICC World XI
// (cs-icc-world-xi), so his page said "for ICC World XI" and its structured data made him a member of it. A player's
// team on the page is his most recent NATIONAL side instead; the stored column is untouched, so no data is rewritten
// and the choice is made on every read.
import { INTERNATIONAL_CRICKET } from "./leagues";
import { canonicalTeamIdSql } from "./teamAliases";

/** The names of the one-off sides: ICC World XI, Asia XI, Africa XI. A national team never ends in "XI". */
export const COMPOSITE_SIDE_NAME = "(^|[[:space:]])XI$";

const LEAGUES = INTERNATIONAL_CRICKET.map((l) => `'${l}'`).join(", ");

/**
 * SQL for the team id a player's page should name, for a row of `players` aliased `p`. For a player of the international
 * cricket competitions whose stored team is a composite side, it is the team of his most recent game for a side that is
 * not one (falling back to the stored team when he never played for one); for everyone else it is `p.team_espn_id`.
 * Used in place of the column: `left join teams t on t.league = p.league and t.espn_id = ${playerTeamIdSql("p")}`.
 */
export function playerTeamIdSql(p = "p"): string {
  const chosen = `(case when ${p}.league in (${LEAGUES}) and exists (select 1 from teams ct where ct.league = ${p}.league and ct.espn_id = ${p}.team_espn_id and ct.name ~* '${COMPOSITE_SIDE_NAME}')
    then coalesce((select s.team_espn_id from player_game_stats s
                     join games g on g.league = s.league and g.espn_id = s.game_espn_id
                     join teams nt on nt.league = s.league and nt.espn_id = s.team_espn_id
                    where s.league = ${p}.league and s.player_espn_id = ${p}.espn_id and nt.name !~* '${COMPOSITE_SIDE_NAME}'
                    order by g.date desc limit 1), ${p}.team_espn_id)
    else ${p}.team_espn_id end)`;
  // A side stored under two ids (Swaziland / Eswatini, see teamAliases.ts) is named once.
  return canonicalTeamIdSql(`${p}.league`, chosen);
}
