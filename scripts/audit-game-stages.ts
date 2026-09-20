// Read-only. For the NBA and NFL: how many stored games fall in each stage, and whether any
// completed game still has no season type. Exits 1 when one does.
import { pool } from "./lib/db";

async function main() {
  const { rows: byStage } = await pool.query(
    `select league, stage, season_type, competition_type, count(*)::int as games
     from games where league in ('nba', 'nfl') group by 1, 2, 3, 4 order by 1, 2, 3, 4`
  );
  console.table(byStage);
  const { rows: untyped } = await pool.query(
    `select league, count(*)::int as games, min(date)::date as first, max(date)::date as last
     from games where league in ('nba', 'nfl') and completed and season_type is null group by 1`
  );
  console.log("[audit-game-stages] completed games without a season type:", untyped.length ? untyped : "none");
  // Teams that exist only because of games that are not counted (e.g. preseason opponents from outside the league).
  const { rows: strays } = await pool.query(
    `select t.league, t.name, count(*)::int as games
     from teams t join games g on g.league = t.league and t.espn_id in (g.home_team_espn_id, g.away_team_espn_id)
     where t.league in ('nba', 'nfl')
     group by t.league, t.espn_id, t.name
     having bool_and(g.stage = 'excluded')
     order by 1, 2`
  );
  console.log("[audit-game-stages] teams whose every game is not counted (informational):", strays.length ? strays : "none");
  await pool.end();
  if (untyped.length > 0) process.exit(1);
}

main().catch((err) => {
  console.error("[audit-game-stages] failed:", err);
  process.exit(1);
});
