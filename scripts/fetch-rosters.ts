import { pool } from "./lib/db";
import { fetchRoster, type League } from "./lib/espn";
import { uniqueSlugFor } from "./lib/players";

const LEAGUES: League[] = ["nba", "nfl", "epl", "laliga", "bundesliga", "seriea", "ucl"];

// NFL's roster endpoint groups athletes by position (`{ position, items: [...] }`);
// NBA's returns a flat list of player objects directly. Normalize both to a flat list.
function flattenAthletes(entries: any[]): any[] {
  const out: any[] = [];
  for (const entry of entries) {
    if (Array.isArray(entry.items)) out.push(...entry.items);
    else if (entry.id) out.push(entry);
  }
  return out;
}

async function processTeam(league: League, teamEspnId: string) {
  const data = await fetchRoster(league, teamEspnId);
  const items = flattenAthletes(data.athletes ?? []);
  let count = 0;

  for (const item of items) {
    const name = item.fullName ?? item.displayName;
    try {
      const slug = await uniqueSlugFor(league, item.id, name);
      await pool.query(
        `insert into players (league, espn_id, team_espn_id, name, slug, position, headshot_url, jersey, height, weight, age, roster_seen_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, now())
         on conflict (league, espn_id) do update set
           team_espn_id = excluded.team_espn_id, name = excluded.name,
           position = excluded.position, headshot_url = excluded.headshot_url,
           jersey = excluded.jersey, height = excluded.height, weight = excluded.weight, age = excluded.age,
           roster_seen_at = now()`,
        [
          league,
          item.id,
          teamEspnId,
          name,
          slug,
          item.position?.abbreviation ?? null,
          item.headshot?.href ?? null,
          item.jersey ?? null,
          item.displayHeight ?? null,
          item.displayWeight ?? null,
          item.age ?? null,
        ]
      );
      count++;
    } catch (err) {
      console.error(`[fetch-rosters] ${league} player ${item.id} (${name}) failed:`, err);
    }
  }
  return count;
}

async function main() {
  const target = process.argv[2] as League | undefined;
  for (const league of target ? [target] : LEAGUES) {
    const { rows: teams } = await pool.query(`select espn_id from teams where league = $1`, [league]);
    let total = 0;
    for (const { espn_id } of teams) {
      try {
        total += await processTeam(league, espn_id);
      } catch (err) {
        console.error(`[fetch-rosters] ${league} team ${espn_id} failed:`, err);
      }
    }
    console.log(`[fetch-rosters] ${league}: upserted ${total} players across ${teams.length} teams`);
  }
  await pool.end();
}

main().catch((err) => {
  console.error("[fetch-rosters] failed:", err);
  process.exit(1);
});
