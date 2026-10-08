// Read named race weekends again from ESPN's core API and fill in their teams, car numbers, statuses and laps:
//   npm run refresh:f1-results -- 600057444 600060990
// With no ids it reads what the daily run would (recent weekends, and any weekend of the season stored without a team or status).
// Safe to repeat: stored values are kept where the feed has none, and a driver already stored with his final status is not asked again.
import { pool } from "./lib/db";
import { fetchByRef, fetchF1Event } from "./lib/f1";
import { f1EventsToRefresh, refreshF1Results } from "./lib/f1-refresh";

async function main() {
  const ids = process.argv.slice(2).filter((a) => /^\d+$/.test(a));
  const eventIds = ids.length > 0 ? ids : await f1EventsToRefresh(pool, new Date().getUTCFullYear());
  const refreshed = await refreshF1Results(pool, eventIds, { fetchEvent: fetchF1Event, fetchRef: fetchByRef });
  console.log(`[refresh-f1-results] ${refreshed.events}/${eventIds.length} weekends, ${refreshed.results} results`);
  await pool.end();
  if (refreshed.failures.length > 0) {
    console.error(`[refresh-f1-results] ERROR: ${refreshed.failures.length} request(s) failed, run it again: ${refreshed.failures.slice(0, 3).join("; ")}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("[refresh-f1-results] failed:", err);
  process.exit(1);
});
