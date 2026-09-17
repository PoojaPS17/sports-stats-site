// Pulls every team's whole current-season schedule, so upcoming fixtures exist for
// the full season rather than only the scoreboard's one-week window. Runs once a
// day (see .github/workflows/scrape.yml). Soccer needs two calls per team: the
// default schedule returns games already played, `fixture=true` the ones to come.
// NFL events carry the official week number, which upsertEvent stores.
import { pool } from "./lib/db";
import { fetchCurrentSeasonYear, fetchTeamSchedule, type League } from "./lib/espn";
import { upsertEvent } from "./lib/games";

const LEAGUES: League[] = ["epl", "laliga", "nfl", "nba"];
const REQUEST_DELAY_MS = 120;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Which schedule variants to request per league. `seasontype` 2 = regular season,
// 3 = postseason (returns nothing until the bracket is set, which is harmless).
function variants(league: League): { seasontype?: number; fixtures?: boolean }[] {
  if (league === "epl" || league === "laliga") return [{}, { fixtures: true }];
  if (league === "nba") return [{ seasontype: 2 }, { seasontype: 3 }];
  return [{}, { seasontype: 3 }];
}

async function main() {
  for (const league of LEAGUES) {
    const season = await fetchCurrentSeasonYear(league);
    if (!season) {
      console.error(`[fetch-fixtures] ${league}: could not determine current season, skipping`);
      continue;
    }
    const { rows: teams } = await pool.query(`select espn_id from teams where league = $1`, [league]);
    const seen = new Set<string>();
    let count = 0;
    for (const { espn_id: teamId } of teams) {
      for (const v of variants(league)) {
        try {
          const data = await fetchTeamSchedule(league, teamId, season, v.seasontype, v.fixtures);
          for (const ev of data.events ?? []) {
            if (seen.has(ev.id)) continue;
            seen.add(ev.id);
            await upsertEvent(league, ev);
            count++;
          }
        } catch (err) {
          console.error(`[fetch-fixtures] ${league} team ${teamId} failed:`, err instanceof Error ? err.message : err);
        }
        await sleep(REQUEST_DELAY_MS);
      }
    }
    console.log(`[fetch-fixtures] ${league} ${season}: upserted ${count} games across ${teams.length} teams`);
  }
  await pool.end();
}

main().catch((err) => {
  console.error("[fetch-fixtures] failed:", err);
  process.exit(1);
});
