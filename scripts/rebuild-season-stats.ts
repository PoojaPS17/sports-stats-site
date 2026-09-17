// Rebuilds a competition's player season totals from its stored box scores. Usage:
//   tsx scripts/rebuild-season-stats.ts ucl         # every season
//   tsx scripts/rebuild-season-stats.ts ucl 2025    # one season
import { pool } from "./lib/db";
import type { League } from "./lib/espn";
import { rebuildSeasonStatsFromBoxScores, seasonStatsFromBoxScores } from "./lib/boxscore-season-stats";

async function main() {
  const league = process.argv[2] as League | undefined;
  const season = process.argv[3] ? Number(process.argv[3]) : null;
  if (!league || !seasonStatsFromBoxScores(league)) {
    console.error("[rebuild-season-stats] usage: tsx scripts/rebuild-season-stats.ts ucl [season]");
    process.exit(1);
  }
  const n = await rebuildSeasonStatsFromBoxScores(league, season);
  console.log(`[rebuild-season-stats] ${league}${season ? ` ${season}` : ""}: wrote ${n} rows`);
  await pool.end();
}

main().catch((err) => {
  console.error("[rebuild-season-stats] failed:", err);
  process.exit(1);
});
