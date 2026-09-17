// Real per-team injury reports — ESPN's own /injuries endpoint. Cricket has no
// equivalent (404s, same gap as its /teams and /roster endpoints). EPL/La Liga's
// endpoint responds but has come back empty in every check so far; it's included
// anyway on the same honest-data principle as everywhere else in this project — if
// ESPN starts populating it, this picks it up with no code change, and if not, the
// page just shows nothing for those leagues rather than us guessing.
import { pool } from "./lib/db";
import { fetchInjuries, type League } from "./lib/espn";

const LEAGUES: League[] = ["nba", "nfl", "epl", "laliga"];

async function processLeague(league: League) {
  const data = await fetchInjuries(league);
  const teams: any[] = data.injuries ?? [];

  await pool.query("delete from injuries where league = $1", [league]);

  let count = 0;
  for (const team of teams) {
    const teamId = team.id;
    for (const injury of team.injuries ?? []) {
      const athlete = injury.athlete;
      if (!teamId || !athlete?.displayName || !injury.status) continue;
      await pool.query(
        `insert into injuries (league, team_espn_id, player_espn_id, player_name, status, short_comment, long_comment, reported_date)
         values ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          league,
          teamId,
          // The injuries feed doesn't carry an athlete id directly on this object in
          // every case — fall back to a name-scoped synthetic id so a row is still
          // storable rather than silently dropped.
          injury.athlete?.id ?? `name:${athlete.displayName}`,
          athlete.displayName,
          injury.status,
          injury.shortComment ?? null,
          injury.longComment ?? null,
          injury.date ?? null,
        ]
      );
      count++;
    }
  }
  console.log(`[fetch-injuries] ${league}: ${teams.length} teams, ${count} injury reports`);
}

async function main() {
  for (const league of LEAGUES) {
    try {
      await processLeague(league);
    } catch (err) {
      console.error(`[fetch-injuries] ${league} failed:`, err instanceof Error ? err.message : err);
    }
  }
  await pool.end();
}

main().catch((err) => {
  console.error("[fetch-injuries] failed:", err);
  process.exit(1);
});
