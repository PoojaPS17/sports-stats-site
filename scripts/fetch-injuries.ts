// Real per-team injury reports — ESPN's own /injuries endpoint. Cricket has no
// equivalent (404s, same gap as its /teams and /roster endpoints). EPL/La Liga's
// endpoint responds but has come back empty in every check so far; it's included
// anyway on the same honest-data principle as everywhere else in this project — if
// ESPN starts populating it, this picks it up with no code change, and if not, the
// page just shows nothing for those leagues rather than us guessing.
import { pool } from "./lib/db";
import { fetchInjuries, type League } from "./lib/espn";
import { recordRun } from "./lib/heartbeat";
import { replaceLeagueInjuries } from "./lib/injuries";

const LEAGUES: League[] = ["nba", "nfl", "epl", "laliga"];

async function main() {
  let failed = 0;
  for (const league of LEAGUES) {
    try {
      const { teams, count } = await replaceLeagueInjuries(pool, league, await fetchInjuries(league));
      console.log(`[fetch-injuries] ${league}: ${teams} teams, ${count} injury reports`);
    } catch (err) {
      failed++;
      console.error(`[fetch-injuries] ${league} failed:`, err instanceof Error ? err.message : err);
    }
  }
  if (failed === 0) await recordRun(pool, "fetch-injuries");
  await pool.end();
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("[fetch-injuries] failed:", err);
  process.exit(1);
});
