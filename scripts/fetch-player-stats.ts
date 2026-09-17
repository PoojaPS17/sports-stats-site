import { pool } from "./lib/db";
import { fetchSummary, type League } from "./lib/espn";
import { upsertPlayerSeasonStats } from "./lib/season-stats";
import { extractPlayerStats, storeGameStats } from "./lib/game-stats";

const LEAGUES: League[] = ["nba", "nfl", "epl", "laliga"];

async function processGame(league: League, gameEspnId: string, touched: Map<string, string>) {
  const data = await fetchSummary(league, gameEspnId);
  const perPlayer = extractPlayerStats(league, data);
  const stored = await storeGameStats(league, gameEspnId, perPlayer, true);
  for (const [id, { teamId }] of perPlayer) touched.set(id, teamId);
  return stored;
}

async function processLeague(league: League) {
  const { rows } = await pool.query(
    `select espn_id from games
     where league = $1 and completed = true and date > now() - interval '3 days'`,
    [league]
  );

  const touched = new Map<string, string>();
  let total = 0;
  for (const { espn_id } of rows) {
    try {
      total += await processGame(league, espn_id, touched);
    } catch (err) {
      console.error(`[fetch-player-stats] ${league} game ${espn_id} failed:`, err);
    }
  }
  console.log(`[fetch-player-stats] ${league}: processed ${rows.length} games, ${total} player-stat rows`);

  let seasonUpdates = 0;
  for (const [playerId, teamId] of touched) {
    try {
      if (await upsertPlayerSeasonStats(league, playerId, teamId)) seasonUpdates++;
    } catch (err) {
      console.error(`[fetch-player-stats] ${league} season stats for player ${playerId} failed:`, err);
    }
  }
  console.log(`[fetch-player-stats] ${league}: updated season stats for ${seasonUpdates}/${touched.size} players`);
}

async function main() {
  for (const league of LEAGUES) {
    try {
      await processLeague(league);
    } catch (err) {
      console.error(`[fetch-player-stats] ${league} failed:`, err instanceof Error ? err.message : err);
    }
  }
  await pool.end();
}

main().catch((err) => {
  console.error("[fetch-player-stats] failed:", err);
  process.exit(1);
});
