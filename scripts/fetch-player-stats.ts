import { pool } from "./lib/db";
import { fetchSummary, type League } from "./lib/espn";
import { upsertPlayerSeasonStats } from "./lib/season-stats";
import { extractPlayerStats, storeGameStats } from "./lib/game-stats";
import { rebuildSeasonStatsFromBoxScores, seasonStatsFromBoxScores } from "./lib/boxscore-season-stats";
import { isLiveTick, scopedLeagues } from "./lib/scope";
import { detailsFromSummary, storeGameDetails } from "./lib/game-details";

const LEAGUES: League[] = ["nba", "nfl", "epl", "laliga", "bundesliga", "seriea", "ucl"];

async function processGame(league: League, game: { espn_id: string; home_team_espn_id: string; away_team_espn_id: string }, touched: Map<string, string>) {
  const data = await fetchSummary(league, game.espn_id);
  const perPlayer = extractPlayerStats(league, data);
  const stored = await storeGameStats(league, game.espn_id, perPlayer, true);
  await storeGameDetails(league, game.espn_id, detailsFromSummary(league, data, game.home_team_espn_id, game.away_team_espn_id));
  for (const [id, { teamId }] of perPlayer) touched.set(id, teamId);
  return stored;
}

async function processLeague(league: League, liveTick: boolean) {
  // A finished game's box score doesn't change, so a live tick fetches only the ones
  // whose match report isn't stored yet — re-fetching every recent game every 15 minutes was by far
  // the biggest source of requests on a match day. The daily full run re-fetches the
  // last three days regardless, which picks up ESPN's occasional late corrections.
  const { rows } = await pool.query(
    liveTick
      ? `select g.espn_id, g.season_year, g.home_team_espn_id, g.away_team_espn_id from games g
         where g.league = $1 and g.completed = true and g.date > now() - interval '3 days'
           and not exists (select 1 from game_details d where d.league = g.league and d.game_espn_id = g.espn_id)`
      : `select espn_id, season_year, home_team_espn_id, away_team_espn_id from games
         where league = $1 and completed = true and date > now() - interval '3 days'`,
    [league]
  );

  const touched = new Map<string, string>();
  let total = 0;
  for (const game of rows) {
    try {
      total += await processGame(league, game, touched);
    } catch (err) {
      console.error(`[fetch-player-stats] ${league} game ${game.espn_id} failed:`, err);
    }
  }
  console.log(`[fetch-player-stats] ${league}: processed ${rows.length} ${liveTick ? "new " : ""}games, ${total} player-stat rows`);

  // The athlete season-stats feed only covers domestic leagues, so a cup's season
  // totals are summed from its own box scores instead — a database query, no requests.
  if (seasonStatsFromBoxScores(league)) {
    const seasons = [...new Set(rows.map((r) => r.season_year as number | null).filter((s): s is number => s != null))];
    for (const season of seasons) {
      const n = await rebuildSeasonStatsFromBoxScores(league, season);
      console.log(`[fetch-player-stats] ${league}: rebuilt ${n} season-total rows for ${season} from box scores`);
    }
    return;
  }

  // Season totals cost one athlete request per player who appeared, so they refresh
  // on the daily run only; a live tick stores the box scores and stops here.
  if (liveTick) {
    if (touched.size > 0) console.log(`[fetch-player-stats] ${league}: season totals for ${touched.size} players refresh on the daily run`);
    return;
  }

  let seasonUpdates = 0;
  for (const [playerId, teamId] of touched) {
    try {
      if (await upsertPlayerSeasonStats(league, playerId, teamId)) seasonUpdates++;
    } catch (err) {
      console.error(`[fetch-player-stats] ${league} season stats for player ${playerId} failed:`, err);
    }
  }
  console.log(`[fetch-player-stats] ${league}: updated season stats for ${seasonUpdates}/${touched.size} players`);
}

async function main() {
  const liveTick = isLiveTick();
  for (const league of scopedLeagues(LEAGUES)) {
    try {
      await processLeague(league, liveTick);
    } catch (err) {
      console.error(`[fetch-player-stats] ${league} failed:`, err instanceof Error ? err.message : err);
    }
  }
  await pool.end();
}

main().catch((err) => {
  console.error("[fetch-player-stats] failed:", err);
  process.exit(1);
});
