// Recurring fetch of the current/most-recent race weekend — like tennis, F1's
// scoreboard endpoint always returns "whichever event is currently on" regardless of
// any date param (confirmed by testing), so this can't reach past weekends; see
// backfill-f1-events.ts for historical seasons.
import { pool } from "./lib/db";
import { fetchF1Scoreboard } from "./lib/f1";
import { upsertF1Weekend } from "./lib/f1-weekend";
import { recordRun } from "./lib/heartbeat";

async function main() {
  const data = await fetchF1Scoreboard();
  const league = data.leagues?.[0];
  const event = data.events?.[0];
  if (!event) {
    console.log("[fetch-f1-scores] no current event found");
    await recordRun(pool, "fetch-f1-scores");
    await pool.end();
    return;
  }
  const { sessions, results } = await upsertF1Weekend(pool, event, league?.season?.year ?? null);
  console.log(`[fetch-f1-scores] ${event.name}: ${sessions} sessions, ${results} results`);
  await recordRun(pool, "fetch-f1-scores");
  await pool.end();
}

main().catch((err) => {
  console.error("[fetch-f1-scores] failed:", err);
  process.exit(1);
});
