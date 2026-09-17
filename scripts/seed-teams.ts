import { pool } from "./lib/db";
import { fetchTeams, fetchCricketTeams, type League } from "./lib/espn";
import { upsertTeam } from "./lib/teams";
import { scopedLeagues } from "./lib/scope";

const CRICKET_LEAGUES: League[] = ["ipl", "bbl", "cwc", "t20wc"];

// Cricket's team source is the current scoreboard's own embedded `teams` array (its
// /teams endpoint 404s) — that's 0 teams for a tournament that isn't currently in
// season (e.g. the World Cups, active only every 2-4 years), which is fine: the
// games backfill upserts every team it encounters as a side effect of each event, so
// this is a nice-to-have head start for cricket, not the only source.
async function seedLeague(league: League) {
  if (CRICKET_LEAGUES.includes(league)) {
    const teams = await fetchCricketTeams(league);
    for (const team of teams) await upsertTeam(league, team);
    console.log(`[seed-teams] ${league}: upserted ${teams.length} teams`);
    return;
  }

  const data = await fetchTeams(league);
  const teams = data.sports[0].leagues[0].teams as any[];
  for (const { team } of teams) await upsertTeam(league, team);
  console.log(`[seed-teams] ${league}: upserted ${teams.length} teams`);
}

const LEAGUES: League[] = ["nba", "nfl", "epl", "laliga", "bundesliga", "seriea", "ucl", "ipl", "bbl", "cwc", "t20wc"];

async function main() {
  const target = process.argv[2] as League | undefined;
  for (const league of target ? [target] : scopedLeagues(LEAGUES)) {
    try {
      await seedLeague(league);
    } catch (err) {
      console.error(`[seed-teams] ${league} failed:`, err instanceof Error ? err.message : err);
    }
  }
  await pool.end();
}

main().catch((err) => {
  console.error("[seed-teams] failed:", err);
  process.exit(1);
});
