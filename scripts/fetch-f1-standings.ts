// Recurring fetch of the current season's Driver and Constructor standings. See
// backfill-f1-standings.ts for every past season — this only ever covers the current
// year, run on a schedule the same way fetch-f1-scores.ts is.
import { pool } from "./lib/db";
import { upsertF1StandingsForSeason } from "./lib/f1";
import { recordRun } from "./lib/heartbeat";

async function main() {
  const seasonYear = new Date().getUTCFullYear();
  const { failedGroups } = await upsertF1StandingsForSeason(pool, seasonYear);
  if (failedGroups === 0) await recordRun(pool, "fetch-f1-standings");
  await pool.end();
  if (failedGroups > 0) process.exit(1);
}

main().catch((err) => {
  console.error("[fetch-f1-standings] failed:", err);
  process.exit(1);
});
