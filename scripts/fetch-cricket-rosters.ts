// Cricket competitions have no working /teams/{id}/roster endpoint (404s: "League not
// found"), so this derives each team's current squad from their most recent completed
// match instead — the one place ESPN's cricket data does expose a real roster,
// complete with a `captain` flag and wicketkeeper position code that no other roster
// source here has.
import { pool } from "./lib/db";
import { fetchSummary, type League } from "./lib/espn";
import { uniqueSlugFor } from "./lib/players";

const CRICKET_LEAGUES: League[] = ["ipl", "bbl", "cwc", "t20wc"];

async function processTeam(league: League, teamEspnId: string) {
  const { rows } = await pool.query(
    `select espn_id from games
     where league = $1 and completed = true
       and (home_team_espn_id = $2 or away_team_espn_id = $2)
     order by date desc
     limit 1`,
    [league, teamEspnId]
  );
  if (rows.length === 0) return 0;

  const data = await fetchSummary(league, rows[0].espn_id);
  const teamRoster = (data.rosters ?? []).find((r: any) => String(r.team?.id) === String(teamEspnId));
  if (!teamRoster) return 0;

  let count = 0;
  for (const item of teamRoster.roster ?? []) {
    const athlete = item.athlete;
    if (!athlete?.id) continue;
    const name = athlete.displayName ?? athlete.fullName;
    const slug = await uniqueSlugFor(league, athlete.id, name);
    const isWicketkeeper = item.position?.abbreviation === "WK";

    await pool.query(
      `insert into players (league, espn_id, team_espn_id, name, slug, position, headshot_url, is_captain, is_wicketkeeper, roster_seen_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9, now())
       on conflict (league, espn_id) do update set
         team_espn_id = excluded.team_espn_id, name = excluded.name,
         position = excluded.position, headshot_url = excluded.headshot_url,
         is_captain = excluded.is_captain, is_wicketkeeper = excluded.is_wicketkeeper, roster_seen_at = now()`,
      [
        league,
        athlete.id,
        teamEspnId,
        name,
        slug,
        item.position?.abbreviation ?? null,
        athlete.headshot?.href ?? null,
        Boolean(item.captain),
        isWicketkeeper,
      ]
    );
    count++;
  }
  return count;
}

async function processLeague(league: League) {
  const { rows: teams } = await pool.query(`select espn_id from teams where league = $1`, [league]);
  let total = 0;
  for (const { espn_id } of teams) {
    try {
      total += await processTeam(league, espn_id);
    } catch (err) {
      console.error(`[fetch-cricket-rosters] ${league} team ${espn_id} failed:`, err instanceof Error ? err.message : err);
    }
  }
  console.log(`[fetch-cricket-rosters] ${league}: upserted ${total} players across ${teams.length} teams`);
}

async function main() {
  const target = process.argv[2] as League | undefined;
  const leagues: League[] = target ? [target] : CRICKET_LEAGUES;
  for (const league of leagues) {
    try {
      await processLeague(league);
    } catch (err) {
      console.error(`[fetch-cricket-rosters] ${league} failed:`, err instanceof Error ? err.message : err);
    }
  }
  await pool.end();
}

main().catch((err) => {
  console.error("[fetch-cricket-rosters] failed:", err);
  process.exit(1);
});
