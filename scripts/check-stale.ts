// Fails (exit 1) when a scheduled scraper has not succeeded within its window (see MAX_AGE_MINUTES).
import { pool } from "./lib/db";
import { findStale } from "./lib/heartbeat";

async function main() {
  const stale = await findStale(pool);
  for (const s of stale) {
    console.error(`[check-stale] ${s.scraper}: ${s.ageMinutes === null ? "never ran" : `last success ${s.ageMinutes} min ago`}`);
  }
  if (stale.length === 0) console.log("[check-stale] all scrapers within their windows");
  await pool.end();
  if (stale.length > 0) process.exit(1);
}

main().catch((err) => {
  console.error("[check-stale] failed:", err);
  process.exit(1);
});
