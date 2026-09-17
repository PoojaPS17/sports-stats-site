import { pool } from "./lib/db";
import { fetchStandings, type League } from "./lib/espn";
import { upsertStandingsResponse } from "./lib/standings";
import { scopedLeagues } from "./lib/scope";

const LEAGUES: League[] = ["nba", "nfl", "epl", "laliga", "ucl", "ipl", "bbl", "cwc", "t20wc"];

async function processLeague(league: League) {
  const data = await fetchStandings(league);
  const count = await upsertStandingsResponse(league, data);
  console.log(`[fetch-standings] ${league}: upserted ${count} rows`);
}

async function main() {
  for (const league of scopedLeagues(LEAGUES)) {
    try {
      await processLeague(league);
    } catch (err) {
      console.error(`[fetch-standings] ${league} failed:`, err instanceof Error ? err.message : err);
    }
  }
  await pool.end();
}

main().catch((err) => {
  console.error("[fetch-standings] failed:", err);
  process.exit(1);
});
