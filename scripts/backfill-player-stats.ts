// One-time historical backfill of player season stats (points/goals/yards per year,
// back to seasonWindowStart in season-row.ts) for every player currently on a roster. The athlete
// season-stats endpoint already returns a player's whole career history in one response, so this
// costs exactly one request per player — same as the recurring scraper's per-player
// call, just storing every season in the response instead of only the latest one.
// No per-player-match boxscore backfill here (that's a much larger scrape — one
// request per historical game — and hasn't been done).
import { pool } from "./lib/db";
import { type League } from "./lib/espn";
import { upsertPlayerSeasonStats } from "./lib/season-stats";
import { notPseudoAthleteSql } from "../src/lib/pseudoAthlete";

// Cricket has no per-player match data yet (ESPN's roster/boxscore endpoints 404 for
// this competition), so there's no athlete season-stats endpoint to backfill from.
const LEAGUES: League[] = ["nba", "nfl", "epl", "laliga", "bundesliga", "seriea"];
const REQUEST_DELAY_MS = 100;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function backfillLeague(league: League) {
  const { rows: players } = await pool.query(`select p.espn_id, p.team_espn_id from players p where p.league = $1 and ${notPseudoAthleteSql()}`, [league]);

  let totalSeasons = 0;
  let playersWithStats = 0;
  for (const { espn_id, team_espn_id } of players) {
    try {
      const count = await upsertPlayerSeasonStats(league, espn_id, team_espn_id);
      if (count > 0) {
        playersWithStats++;
        totalSeasons += count;
      }
    } catch (err) {
      console.error(`[backfill-player-stats] ${league} player ${espn_id} failed:`, err instanceof Error ? err.message : err);
    }
    await sleep(REQUEST_DELAY_MS);
  }
  console.log(
    `[backfill-player-stats] ${league}: ${players.length} players scanned, ${playersWithStats} had stats, ${totalSeasons} season rows upserted`
  );
}

async function main() {
  const target = process.argv[2] as League | undefined;
  const leagues: League[] = target ? [target] : LEAGUES;

  for (const league of leagues) {
    console.log(`[backfill-player-stats] starting ${league}...`);
    await backfillLeague(league);
  }
  await pool.end();
}

main().catch((err) => {
  console.error("[backfill-player-stats] failed:", err);
  process.exit(1);
});
