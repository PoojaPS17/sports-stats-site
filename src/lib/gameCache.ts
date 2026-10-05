// Which league game pages (/<league>/games/<id>) may be served by their day-cached route, decided by
// the proxy from the stored row alone. The same arrangement as cricketMatchCache.ts: a page cannot
// switch between cached and dynamic per request in this Next version, so a settled game is rewritten
// to /<league>/games/final/<id>, the same page with a day window.
//
// Settled means completed with its report stored in game_details: the page then reads nothing from
// ESPN, so its render is the stored data and nothing in it moves. A completed game whose report has
// not been stored yet still renders from ESPN's live summary and stays per request until the
// scrape stores it.
import { pool } from "./db";

interface StoredGame {
  completed: boolean;
  has_details: boolean;
}

export function isStoredFinalGame(row: StoredGame | null): boolean {
  return row?.completed === true && row.has_details === true;
}

/** One indexed read; any failure says no, and the public route renders the game as usual. */
export async function storedGameIsFinal(league: string, espnId: string): Promise<boolean> {
  try {
    const { rows } = await pool.query(
      `select g.completed, exists (select 1 from game_details d where d.league = g.league and d.game_espn_id = g.espn_id) as has_details
       from games g where g.league = $1 and g.espn_id = $2`,
      [league, espnId]
    );
    return isStoredFinalGame(rows[0] ?? null);
  } catch (err) {
    console.warn(`[games] final-game lookup failed for ${league}/${espnId}: ${err instanceof Error ? err.message : err}`);
    return false;
  }
}
