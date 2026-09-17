// Stores the match report the page shows (timeline, line-ups, team and player box,
// win probability) from the same summary response the box-score writer already
// fetched, so the recurring scrape and the backfill add no requests for it.
import { pool } from "./db";
import { isCricketLeague, isSoccerLeague, type League } from "./espn";
import { extractGameDetails, type GameDetails, type MatchSport } from "../../src/lib/matchDetail";

export function matchSport(league: League): MatchSport {
  return isSoccerLeague(league) ? "soccer" : isCricketLeague(league) ? "cricket" : "american";
}

export function detailsFromSummary(league: League, summary: any, homeId: string, awayId: string): GameDetails {
  return extractGameDetails(matchSport(league), summary, homeId, awayId);
}

export async function storeGameDetails(league: League, gameEspnId: string, details: GameDetails): Promise<void> {
  await pool.query(
    `insert into game_details (league, game_espn_id, details, fetched_at) values ($1, $2, $3, now())
     on conflict (league, game_espn_id) do update set details = excluded.details, fetched_at = now()`,
    [league, gameEspnId, JSON.stringify(details)]
  );
}
