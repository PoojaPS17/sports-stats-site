// One-time historical backfill of final standings tables — static once a season has
// ended, so this only needs to run once per league (not part of the recurring cron).
// Safe to re-run/resume — all writes are upserts.
import { pool } from "./lib/db";
import { fetchStandingsBySeason, type League } from "./lib/espn";
import { upsertStandingsResponse } from "./lib/standings";

const YEARS_BACK = 10;
const REQUEST_DELAY_MS = 150;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function backfillLeague(league: League) {
  const currentYear = new Date().getUTCFullYear();
  let total = 0;
  for (let season = currentYear - YEARS_BACK; season <= currentYear; season++) {
    try {
      const data = await fetchStandingsBySeason(league, season);
      const count = await upsertStandingsResponse(league, data, season);
      total += count;
      console.log(`[backfill-standings] ${league} ${season}: upserted ${count} rows`);
    } catch (err) {
      console.error(`[backfill-standings] ${league} ${season} failed:`, err instanceof Error ? err.message : err);
    }
    await sleep(REQUEST_DELAY_MS);
  }
  console.log(`[backfill-standings] ${league}: done, ${total} rows total across ${YEARS_BACK + 1} seasons`);
}

async function main() {
  const target = process.argv[2] as League | undefined;
  const leagues: League[] = target ? [target] : ["nba", "nfl", "epl", "ipl", "bbl", "cwc", "t20wc"];

  for (const league of leagues) {
    console.log(`[backfill-standings] starting ${league} (last ${YEARS_BACK} years)...`);
    await backfillLeague(league);
  }
  await pool.end();
}

main().catch((err) => {
  console.error("[backfill-standings] failed:", err);
  process.exit(1);
});
