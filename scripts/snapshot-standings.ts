import { pool } from "./lib/db";
import { snapshotStandings } from "./lib/standingsHistory";

async function main() {
  const count = await snapshotStandings(pool);
  console.log(`[snapshot-standings] saved ${count} rows`);
  await pool.end();
}

main().catch((err) => {
  console.error("[snapshot-standings] failed:", err);
  process.exit(1);
});
