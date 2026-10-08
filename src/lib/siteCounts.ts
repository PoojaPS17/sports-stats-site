// The two numbers under the first-visit headline: how much the site holds. Both are counted from the stored
// rows (never typed in), read once a day, and a failed read leaves them out rather than showing a stale or
// invented figure.
import { unstable_cache } from "next/cache";
import { pool } from "./db";
import { CRICKET_LEAGUES } from "./leagues";

export interface SiteCounts {
  /** Player pages with figures on them: one per (competition, player) with a box-score row or a season line. */
  playerPages: number;
  /** Cricket matches in the `games` table that have a stored scorecard (some domestic series are held elsewhere, so this is a floor). */
  cricketScorecards: number;
}

export async function readSiteCounts(): Promise<SiteCounts> {
  const [players, cards] = await Promise.all([
    pool.query(
      `select count(*)::int as n from (
         select league, player_espn_id from player_game_stats
         union
         select league, player_espn_id from player_season_stats
       ) p`
    ),
    pool.query(
      `select count(*)::int as n from games g
       where g.league = any($1) and exists (select 1 from player_game_stats s where s.league = g.league and s.game_espn_id = g.espn_id)`,
      [CRICKET_LEAGUES]
    ),
  ]);
  return { playerPages: players.rows[0].n, cricketScorecards: cards.rows[0].n };
}

const cached = unstable_cache(readSiteCounts, ["site-counts"], { revalidate: 86400 });

/** The counts, or null when the database cannot answer: the page then simply omits the row. */
export async function getSiteCounts(): Promise<SiteCounts | null> {
  try {
    return await cached();
  } catch {
    return null;
  }
}
