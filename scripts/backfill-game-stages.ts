// Gives a season type to every stored NBA/NFL game that lacks one, by re-reading that day's
// scoreboard. Safe to re-run; a game ESPN no longer lists stays untyped and is reported.
//   tsx scripts/backfill-game-stages.ts          # nba and nfl
//   tsx scripts/backfill-game-stages.ts nba
import { pool } from "./lib/db";
import { fetchScoreboard, type League } from "./lib/espn";
import { classifyUntypedGames } from "./lib/stage-backfill";

async function main() {
  const target = process.argv[2];
  // Only leagues whose games carry a season type: for any other league every game would read as untyped.
  if (target !== undefined && target !== "nba" && target !== "nfl") {
    console.error("usage: tsx scripts/backfill-game-stages.ts [nba|nfl]");
    process.exit(1);
  }
  const leagues: League[] = target ? [target] : ["nba", "nfl"];
  let stillUntyped = 0;
  for (const league of leagues) {
    const res = await classifyUntypedGames(pool, league, async (l, d) => {
      const data = await fetchScoreboard(l, d);
      // One request per distinct day: stay polite to ESPN.
      await new Promise((r) => setTimeout(r, 100));
      return data;
    });
    console.log(`[backfill-game-stages] ${league}: read ${res.dates} scoreboard days, ${res.stillUntyped} games still without a type`);
    stillUntyped += res.stillUntyped;
  }
  await pool.end();
  if (stillUntyped > 0) process.exit(1);
}

main().catch((err) => {
  console.error("[backfill-game-stages] failed:", err);
  process.exit(1);
});
