// One-off cleanup found by the 2026-09-18 data audit: fixtures whose sides were
// never known ("TBA v TBA" finals-week placeholders, now skipped by the scraper)
// and tennis rows ESPN listed with no players, no score and no result.
import { pool } from "./lib/db";

async function main() {
  const games = await pool.query(`delete from games where name ~* '^tb[acd] v tb[acd]$' or home_team_espn_id = away_team_espn_id returning league, espn_id, name`);
  console.log(`[prune] placeholder games removed: ${games.rowCount}`, games.rows.map((r) => `${r.league}:${r.espn_id}`).join(" "));
  const tennis = await pool.query(
    `delete from tennis_matches
     where (side1 is null or side1->>'name' is null) and (side2 is null or side2->>'name' is null) and score_display is null
       and ((status_state = 'pre' and date < now() - interval '7 days') or (completed and winner_espn_id is null))`
  );
  console.log(`[prune] empty tennis rows removed: ${tennis.rowCount}`);
  const team = await pool.query(`delete from teams where name in ('TBA','TBC','TBD') and not exists (select 1 from games g where g.league = teams.league and (g.home_team_espn_id = teams.espn_id or g.away_team_espn_id = teams.espn_id))`);
  console.log(`[prune] placeholder teams removed: ${team.rowCount}`);
  await pool.end();
}

main().catch((err) => {
  console.error("[prune] failed:", err);
  process.exit(1);
});
