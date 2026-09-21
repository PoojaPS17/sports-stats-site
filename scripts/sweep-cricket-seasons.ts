// Daily: adds any match of the eight ESPN-fed cricket competitions (IPL, BBL, WPL, WBBL and the four
// World Cups) that is missing from the games table, for the previous and the current season. Two
// requests per competition. Existing games are left alone. See scripts/lib/season-sweep.ts.
//
//   npm run sweep:cricket-seasons
import { pool } from "./lib/db";
import { sweepCricketSeasons } from "./lib/season-sweep";

async function main() {
  const results = await sweepCricketSeasons();
  let failed = 0;
  for (const r of results) {
    if (r.listed > 0 || r.error) console.log(`[sweep-cricket-seasons] ${r.league} ${r.season}: ${r.listed} listed, ${r.missing} missing, ${r.added} added${r.error ? ` (${r.error})` : ""}`);
    if (r.error) failed += 1;
  }
  console.log(`[sweep-cricket-seasons] ${results.reduce((n, r) => n + r.added, 0)} matches added across ${results.length} competition seasons`);
  await pool.end();
  if (failed > 0) process.exitCode = 1;
}

main().catch(async (err) => {
  console.error("[sweep-cricket-seasons] failed:", err instanceof Error ? err.message : err);
  await pool.end().catch(() => {});
  process.exit(1);
});
