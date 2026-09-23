// One-time historical backfill of every past edition's medal tally (1951-2026).
// Run manually once (npm run backfill:asian-games-medals); not scheduled, because
// a closed edition's medal table never changes. Catch-and-continue per edition, like
// fetch-standings.ts's per-league loop: one edition's Wikipedia page having moved or
// changed structure should never block the other 19.
import { pool } from "./lib/db";
import { fetchMedalTable, upsertMedalTally } from "./lib/asianGamesMedals";
import { ASIAN_GAMES_EDITIONS } from "../src/lib/asianGamesEditions";

async function main() {
  for (const edition of ASIAN_GAMES_EDITIONS) {
    try {
      const { rows, sourceUrl } = await fetchMedalTable(edition.year);
      const count = await upsertMedalTally(edition.year, rows, sourceUrl);
      console.log(`[backfill-asian-games-medals] ${edition.year}: upserted ${count} rows`);
    } catch (err) {
      console.error(`[backfill-asian-games-medals] ${edition.year} failed:`, err instanceof Error ? err.message : err);
    }
  }
  await pool.end();
}

main().catch((err) => {
  console.error("[backfill-asian-games-medals] failed:", err);
  process.exit(1);
});
