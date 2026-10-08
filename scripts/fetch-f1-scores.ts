// Recurring fetch of the current/most-recent race weekend — like tennis, F1's
// scoreboard endpoint always returns "whichever event is currently on" regardless of
// any date param (confirmed by testing), so this can't reach past weekends; see
// backfill-f1-events.ts for historical seasons.
//
// The scoreboard has positions only, and moves to the next weekend once the race is over, so the second half of the run reads the
// finished weekends from the core API (team, car number, status, laps): scripts/lib/f1-refresh.ts.
import { pool } from "./lib/db";
import { fetchByRef, fetchF1Event, fetchF1Scoreboard } from "./lib/f1";
import { upsertF1Weekend } from "./lib/f1-weekend";
import { f1EventsToRefresh, refreshF1Results } from "./lib/f1-refresh";
import { recordRun } from "./lib/heartbeat";

async function main() {
  const data = await fetchF1Scoreboard();
  const league = data.leagues?.[0];
  const event = data.events?.[0];
  const seasonYear: number = league?.season?.year ?? new Date().getUTCFullYear();
  if (!event) {
    console.log("[fetch-f1-scores] no current event found");
  } else {
    const { sessions, results } = await upsertF1Weekend(pool, event, seasonYear, { fetchRef: fetchByRef });
    console.log(`[fetch-f1-scores] ${event.name}: ${sessions} sessions, ${results} results`);
  }

  const eventIds = await f1EventsToRefresh(pool, seasonYear);
  const refreshed = await refreshF1Results(pool, eventIds, { fetchEvent: fetchF1Event, fetchRef: fetchByRef });
  console.log(`[fetch-f1-scores] core results: ${refreshed.events}/${eventIds.length} weekends, ${refreshed.results} results`);
  if (refreshed.failures.length > 0) {
    // The scoreboard half is saved; the weekends that failed are read again by the next run. The run is not recorded as successful.
    console.error(`[fetch-f1-scores] ERROR: ${refreshed.failures.length} core request(s) failed: ${refreshed.failures.slice(0, 3).join("; ")}`);
    await pool.end();
    process.exit(1);
  }
  await recordRun(pool, "fetch-f1-scores");
  await pool.end();
}

main().catch((err) => {
  console.error("[fetch-f1-scores] failed:", err);
  process.exit(1);
});
