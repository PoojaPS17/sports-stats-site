// Recurring fetch of the current season's Driver and Constructor standings. See
// backfill-f1-standings.ts for every past season — this only ever covers the current
// year, run on a schedule the same way fetch-f1-scores.ts is.
import { pool } from "./lib/db";
import { upsertF1StandingsForSeason } from "./lib/f1";

async function main() {
  const seasonYear = new Date().getUTCFullYear();
  await upsertF1StandingsForSeason(pool, seasonYear);
  await pool.end();
}

main().catch((err) => {
  console.error("[fetch-f1-standings] failed:", err);
  process.exit(1);
});
