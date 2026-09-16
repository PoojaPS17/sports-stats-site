import { pool } from "./lib/db";
import { fetchTeams, slugify, type League } from "./lib/espn";

async function seedLeague(league: League) {
  const data = await fetchTeams(league);
  const teams = data.sports[0].leagues[0].teams as any[];

  for (const { team } of teams) {
    const logo = team.logos?.find((l: any) => l.rel.includes("default"))?.href ?? team.logos?.[0]?.href ?? null;
    await pool.query(
      `insert into teams (league, espn_id, name, slug, abbreviation, logo_url)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (league, espn_id) do update set
         name = excluded.name, slug = excluded.slug,
         abbreviation = excluded.abbreviation, logo_url = excluded.logo_url`,
      [league, team.id, team.displayName, slugify(team.displayName), team.abbreviation, logo]
    );
  }
  console.log(`[seed-teams] ${league}: upserted ${teams.length} teams`);
}

async function main() {
  await seedLeague("nba");
  await seedLeague("nfl");
  await pool.end();
}

main().catch((err) => {
  console.error("[seed-teams] failed:", err);
  process.exit(1);
});
