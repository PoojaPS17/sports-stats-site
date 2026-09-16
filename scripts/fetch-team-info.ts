// Venue + head coach for every team — run alongside the daily roster fetch, since
// coach changes happen on roughly the same slow cadence as roster moves (venues
// essentially never change). Not run for IPL (see lib/team-info.ts).
import { pool } from "./lib/db";
import { fetchCurrentSeasonYear, type League } from "./lib/espn";
import { upsertTeamInfo } from "./lib/team-info";

const LEAGUES: League[] = ["nba", "nfl", "epl"];

async function processLeague(league: League) {
  const season = await fetchCurrentSeasonYear(league);
  if (!season) {
    console.error(`[fetch-team-info] ${league}: could not resolve current season, skipping`);
    return;
  }

  const { rows: teams } = await pool.query(`select espn_id from teams where league = $1`, [league]);
  let count = 0;
  for (const { espn_id } of teams) {
    try {
      if (await upsertTeamInfo(league, espn_id, season)) count++;
    } catch (err) {
      console.error(`[fetch-team-info] ${league} team ${espn_id} failed:`, err instanceof Error ? err.message : err);
    }
  }
  console.log(`[fetch-team-info] ${league}: updated ${count}/${teams.length} teams (season ${season})`);
}

async function main() {
  for (const league of LEAGUES) {
    try {
      await processLeague(league);
    } catch (err) {
      console.error(`[fetch-team-info] ${league} failed:`, err instanceof Error ? err.message : err);
    }
  }
  await pool.end();
}

main().catch((err) => {
  console.error("[fetch-team-info] failed:", err);
  process.exit(1);
});
