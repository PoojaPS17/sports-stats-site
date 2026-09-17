// One-time historical backfill of Driver/Constructor standings for every past
// season — the gap this fills: backfill-f1-events.ts already covers 11 years of race
// results, but standings is a genuinely separate ESPN resource (final championship
// points/positions, not something derivable by summing session results ourselves)
// that was only ever being fetched for the current year via fetch-f1-standings.ts.
// Cheap (2 requests per season: driver group + constructor group), so no concurrency
// pool needed the way the events/matches backfills use.
import { pool } from "./lib/db";
import { upsertF1StandingsForSeason } from "./lib/f1";

const YEARS_BACK = 10;

async function main() {
  const currentYear = new Date().getUTCFullYear();
  for (let year = currentYear - YEARS_BACK; year <= currentYear; year++) {
    await upsertF1StandingsForSeason(pool, year);
  }
  await pool.end();
}

main().catch((err) => {
  console.error("[backfill-f1-standings] failed:", err);
  process.exit(1);
});
