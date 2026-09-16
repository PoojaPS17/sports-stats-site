import { pool } from "./lib/db";
import { fetchTeams, fetchCricketTeams, type League } from "./lib/espn";
import { upsertTeam } from "./lib/teams";

async function seedLeague(league: League) {
  if (league === "ipl") {
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

const LEAGUES: League[] = ["nba", "nfl", "epl", "ipl"];

async function main() {
  for (const league of LEAGUES) await seedLeague(league);
  await pool.end();
}

main().catch((err) => {
  console.error("[seed-teams] failed:", err);
  process.exit(1);
});
