// Records a successful run of the named scraper in scrape_runs (its heartbeat): record-run.ts <scraper>.
import { pool } from "./lib/db";
import { recordRun } from "./lib/heartbeat";

async function main() {
  const name = process.argv[2];
  if (!name) {
    console.error("usage: record-run.ts <scraper>");
    process.exit(1);
  }
  await recordRun(pool, name);
  await pool.end();
}

main().catch((err) => {
  console.error("[record-run] failed:", err);
  process.exit(1);
});
