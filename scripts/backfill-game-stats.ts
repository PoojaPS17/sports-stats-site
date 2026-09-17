// One-time historical backfill of per-game player box scores for every completed
// game that has none yet — powers top performers on past matchweeks, historical game
// logs, and player records. One request per game, so a league takes a while (the
// NFL is ~3,000 games, the NBA ~15,000); safe to stop and resume, since only games
// without stats are fetched. Usage:
//   tsx scripts/backfill-game-stats.ts            # every league, all seasons
//   tsx scripts/backfill-game-stats.ts nfl        # one league
//   tsx scripts/backfill-game-stats.ts nfl 2022   # one league, seasons from 2022 on
import { pool } from "./lib/db";
import { fetchSummary, type League } from "./lib/espn";
import { extractPlayerStats, storeGameStats } from "./lib/game-stats";

const LEAGUES: League[] = ["nfl", "epl", "laliga", "nba"];
const REQUEST_DELAY_MS = 80;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function backfillLeague(league: League, fromSeason: number | null) {
  const { rows: games } = await pool.query(
    `select g.espn_id, g.season_year from games g
     where g.league = $1 and g.completed = true
       and ($2::int is null or g.season_year >= $2)
       and not exists (select 1 from player_game_stats s where s.league = g.league and s.game_espn_id = g.espn_id)
     order by g.date desc`,
    [league, fromSeason]
  );
  console.log(`[backfill-game-stats] ${league}: ${games.length} games without box scores`);

  let done = 0;
  let rows = 0;
  let empty = 0;
  const started = Date.now();
  for (const { espn_id } of games) {
    try {
      const summary = await fetchSummary(league, espn_id);
      const perPlayer = extractPlayerStats(league, summary);
      if (perPlayer.size === 0) empty++;
      rows += await storeGameStats(league, espn_id, perPlayer, false);
      done++;
      if (done % 100 === 0) {
        const mins = ((Date.now() - started) / 60000).toFixed(1);
        console.log(`[backfill-game-stats] ${league}: ${done}/${games.length} games, ${rows} rows, ${empty} without data, ${mins} min`);
      }
    } catch (err) {
      console.error(`[backfill-game-stats] ${league} game ${espn_id} failed:`, err instanceof Error ? err.message : err);
    }
    await sleep(REQUEST_DELAY_MS);
  }
  console.log(`[backfill-game-stats] ${league}: finished ${done}/${games.length} games, ${rows} player rows, ${empty} games had no box score`);
}

async function main() {
  const target = process.argv[2] as League | undefined;
  const fromSeason = process.argv[3] ? Number(process.argv[3]) : null;
  const leagues: League[] = target ? [target] : LEAGUES;
  for (const league of leagues) await backfillLeague(league, fromSeason);
  await pool.end();
}

main().catch((err) => {
  console.error("[backfill-game-stats] failed:", err);
  process.exit(1);
});
