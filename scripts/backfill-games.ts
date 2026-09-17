// One-time historical backfill of match/score data, run manually (not part of the
// recurring 15-min cron) — this data is static (completed seasons never change), so
// it only needs to be pulled once and then lives in the DB permanently. Uses the
// per-team `schedule?season=` endpoint (a whole season in one call) for NBA/NFL/EPL.
// Cricket has no such per-team endpoint for this competition (404s, same as /teams
// and /roster), but its `scoreboard` endpoint accepts `season=` directly and returns
// the whole season in one call too — so IPL backfill is just as cheap (one request
// per season instead of per team x season).
// Safe to re-run/resume — all writes are upserts.
import { pool } from "./lib/db";
import { fetchScoreboardBySeason, fetchTeamSchedule, type League } from "./lib/espn";
import { upsertEvent } from "./lib/games";

const YEARS_BACK = 10;
const REQUEST_DELAY_MS = 120;
const CRICKET_LEAGUES: League[] = ["ipl", "bbl", "cwc", "t20wc"];

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Over-cover by one extra year label on each side rather than get the NBA
// ending-year vs NFL/soccer starting-year convention exactly right — an
// out-of-range season just returns 0 events (harmless).
function seasonsToTry(): number[] {
  const currentYear = new Date().getUTCFullYear();
  const years: number[] = [];
  for (let y = currentYear - YEARS_BACK - 1; y <= currentYear; y++) years.push(y);
  return years;
}

async function backfillViaTeamSchedules(league: League) {
  const { rows: teams } = await pool.query(`select espn_id from teams where league = $1`, [league]);
  const seasons = seasonsToTry();
  const seen = new Set<string>();
  let gameCount = 0;
  // The default (unparameterized) team-schedule call only returns the regular season
  // — postseason games (and their round names, e.g. "NBA Finals - Game 6", "Super Bowl
  // LVIII") need an explicit seasontype=3 request. Not meaningful for EPL (no playoffs
  // in the league itself) or IPL (handled separately, and its scoreboard-by-season
  // already includes its own playoff stage within the one request).
  const seasonTypes = league === "nba" || league === "nfl" ? [undefined, 3] : [undefined];

  for (const { espn_id: teamId } of teams) {
    for (const season of seasons) {
      for (const seasontype of seasonTypes) {
        try {
          const data = await fetchTeamSchedule(league, teamId, season, seasontype);
          for (const ev of data.events ?? []) {
            if (seen.has(ev.id)) continue;
            seen.add(ev.id);
            await upsertEvent(league, ev);
            gameCount++;
          }
        } catch (err) {
          console.error(
            `[backfill-games] ${league} team ${teamId} season ${season}${seasontype ? ` (postseason)` : ""} failed:`,
            err instanceof Error ? err.message : err
          );
        }
        await sleep(REQUEST_DELAY_MS);
      }
    }
  }
  console.log(`[backfill-games] ${league}: scanned ${teams.length} teams x ${seasons.length} seasons, upserted ${gameCount} games`);
}

// Cricket: the competition id in the URL path (e.g. IPL's 8048) only resolves to the
// *current* season by default, but `scoreboard?season=YYYY` returns that whole
// season's matches in one call — so one request per year covers all of that
// competition's history, same order-of-magnitude cost as the per-team-schedule
// approach used for the others.
async function backfillCricketViaSeasonScoreboard(league: League) {
  const currentYear = new Date().getUTCFullYear();
  const seen = new Set<string>();
  let gameCount = 0;

  for (let season = currentYear - YEARS_BACK; season <= currentYear; season++) {
    try {
      const data = await fetchScoreboardBySeason(league, season);
      for (const ev of data.events ?? []) {
        if (seen.has(ev.id)) continue;
        seen.add(ev.id);
        await upsertEvent(league, ev);
        gameCount++;
      }
    } catch (err) {
      console.error(`[backfill-games] ${league} season ${season} failed:`, err instanceof Error ? err.message : err);
    }
    await sleep(REQUEST_DELAY_MS);
  }
  console.log(`[backfill-games] ${league}: scanned ${YEARS_BACK + 1} seasons, upserted ${gameCount} games`);
}

async function main() {
  const target = process.argv[2] as League | undefined;
  const leagues: League[] = target ? [target] : ["nba", "nfl", "epl", "laliga", "ipl", "bbl", "cwc", "t20wc"];

  for (const league of leagues) {
    console.log(`[backfill-games] starting ${league} (last ${YEARS_BACK} years)...`);
    if (CRICKET_LEAGUES.includes(league)) {
      await backfillCricketViaSeasonScoreboard(league);
    } else {
      await backfillViaTeamSchedules(league);
    }
  }
  await pool.end();
}

main().catch((err) => {
  console.error("[backfill-games] failed:", err);
  process.exit(1);
});
