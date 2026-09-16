import { pool } from "./lib/db";
import { fetchTeams, fetchCricketTeams, slugify, type League } from "./lib/espn";

async function upsertTeam(league: League, team: any) {
  const logo = team.logos?.find((l: any) => l.rel?.includes("default"))?.href ?? team.logos?.[0]?.href ?? null;
  const color = team.color ? `#${team.color}` : null;
  const alternateColor = team.alternateColor ? `#${team.alternateColor}` : null;
  await pool.query(
    `insert into teams (league, espn_id, name, slug, abbreviation, logo_url, color, alternate_color)
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     on conflict (league, espn_id) do update set
       name = excluded.name, slug = excluded.slug,
       abbreviation = excluded.abbreviation, logo_url = excluded.logo_url,
       color = excluded.color, alternate_color = excluded.alternate_color`,
    [league, team.id, team.displayName, slugify(team.displayName), team.abbreviation, logo, color, alternateColor]
  );
}

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
