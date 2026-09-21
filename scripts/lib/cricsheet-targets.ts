// Which stored games the Cricsheet importer's cards-only mode (ipl / bbl) works on, apart
// from the script so it can run against a test database. `db` is the pool (or any client).
import type { Pool } from "pg";
import { CRICSHEET_REPORT_SQL } from "./cricsheet-report";

export interface CardsOnlyGame {
  espn_id: string;
  home_id: string;
  home_name: string;
  home_abbr: string | null;
  away_id: string;
  away_name: string;
  away_abbr: string | null;
}

// A Cricsheet-fed report: a Cricsheet league, batting rows with no dismissal text, and no ESPN-stamped card (see cricsheet-report.ts).
const CRICSHEET_REPORT = `exists (
  select 1 from game_details d where d.league = g.league and d.game_espn_id = g.espn_id and ${CRICSHEET_REPORT_SQL})`;

/**
 * Completed games of the league with no player rows yet. With `rewrite`, also the games whose
 * player rows and report were filled by an earlier Cricsheet run, so they are redone under the
 * current rules (the 0* (0) batter, a card for every player in the XI). A game filled from
 * ESPN is never selected: its figures are ESPN's, refresh-cricket-cards.ts owns them.
 */
export async function selectCardsOnlyGames(db: Pick<Pool, "query">, league: string, rewrite: boolean): Promise<CardsOnlyGame[]> {
  const { rows } = await db.query(
    `select g.espn_id, h.espn_id as home_id, h.name as home_name, h.abbreviation as home_abbr, a.espn_id as away_id, a.name as away_name, a.abbreviation as away_abbr
     from games g
     join teams h on h.league = g.league and h.espn_id = g.home_team_espn_id
     join teams a on a.league = g.league and a.espn_id = g.away_team_espn_id
     where g.league = $1 and g.completed
       and (not exists (select 1 from player_game_stats s where s.league = g.league and s.game_espn_id = g.espn_id)
            or ($2 and ${CRICSHEET_REPORT}))`,
    [league, rewrite]
  );
  return rows;
}
