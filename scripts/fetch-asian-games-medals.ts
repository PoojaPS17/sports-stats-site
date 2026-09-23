// Recurring fetch of the current edition's medal tally. See
// backfill-asian-games-medals.ts for every past edition — this only ever covers
// the current edition (src/lib/asianGamesEditions.ts), run on a schedule the same
// way fetch-f1-standings.ts is.
import { pool } from "./lib/db";
import { fetchMedalTable, upsertMedalTally } from "./lib/asianGamesMedals";
import { recordRun } from "./lib/heartbeat";
import { CURRENT_EDITION_YEAR, currentEdition, isGamesOpen } from "../src/lib/asianGamesEditions";

async function main() {
  try {
    if (!isGamesOpen(currentEdition())) {
      console.log(`[fetch-asian-games-medals] ${CURRENT_EDITION_YEAR}: Games closed, skipping fetch`);
      await recordRun(pool, "fetch-asian-games-medals");
      await pool.end();
      return;
    }
    const { rows, sourceUrl } = await fetchMedalTable(CURRENT_EDITION_YEAR);
    const count = await upsertMedalTally(CURRENT_EDITION_YEAR, rows, sourceUrl);
    console.log(`[fetch-asian-games-medals] ${CURRENT_EDITION_YEAR}: upserted ${count} rows`);
    await recordRun(pool, "fetch-asian-games-medals");
    await pool.end();
  } catch (err) {
    console.error("[fetch-asian-games-medals] failed:", err instanceof Error ? err.message : err);
    await pool.end();
    process.exit(1);
  }
}

main();
