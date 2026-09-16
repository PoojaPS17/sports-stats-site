// One-time historical backfill of match/score data, run manually (not part of the
// recurring 15-min cron). Uses the per-team `schedule?season=` endpoint (a whole
// season in one call) for NBA/NFL/EPL — cricket has no such endpoint for this
// competition (404s, same as /teams and /roster), so it falls back to day-by-day
// scoreboard scanning over a much smaller in-season window.
// Safe to re-run/resume — all writes are upserts.
import { pool } from "./lib/db";
import { fetchScoreboard, fetchTeamSchedule, type League } from "./lib/espn";
import { upsertEvent } from "./lib/games";

const YEARS_BACK = 2;
const REQUEST_DELAY_MS = 120;

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

  for (const { espn_id: teamId } of teams) {
    for (const season of seasons) {
      try {
        const data = await fetchTeamSchedule(league, teamId, season);
        for (const ev of data.events ?? []) {
          if (seen.has(ev.id)) continue;
          seen.add(ev.id);
          await upsertEvent(league, ev);
          gameCount++;
        }
      } catch (err) {
        console.error(`[backfill-games] ${league} team ${teamId} season ${season} failed:`, err instanceof Error ? err.message : err);
      }
      await sleep(REQUEST_DELAY_MS);
    }
  }
  console.log(`[backfill-games] ${league}: scanned ${teams.length} teams x ${seasons.length} seasons, upserted ${gameCount} games`);
}

// Cricket fallback: day-by-day scoreboard scan, but only across the roughly 3
// in-season months per year (IPL runs ~March-May), so the total call count stays small.
async function backfillCricketViaScoreboard(league: League) {
  const months = [3, 4, 5];
  const today = new Date();
  const start = new Date(today);
  start.setUTCFullYear(start.getUTCFullYear() - YEARS_BACK);

  const dates: string[] = [];
  for (const d = new Date(start); d <= today; d.setUTCDate(d.getUTCDate() + 1)) {
    if (months.includes(d.getUTCMonth() + 1)) {
      dates.push(d.toISOString().slice(0, 10).replace(/-/g, ""));
    }
  }

  const seen = new Set<string>();
  let gameCount = 0;
  for (const date of dates) {
    try {
      const data = await fetchScoreboard(league, date);
      for (const ev of data.events ?? []) {
        if (seen.has(ev.id)) continue;
        seen.add(ev.id);
        await upsertEvent(league, ev);
        gameCount++;
      }
    } catch (err) {
      console.error(`[backfill-games] ${league} ${date} failed:`, err instanceof Error ? err.message : err);
    }
    await sleep(REQUEST_DELAY_MS);
  }
  console.log(`[backfill-games] ${league}: scanned ${dates.length} dates, upserted ${gameCount} games`);
}

async function main() {
  const target = process.argv[2] as League | undefined;
  const leagues: League[] = target ? [target] : ["nba", "nfl", "epl", "ipl"];

  for (const league of leagues) {
    console.log(`[backfill-games] starting ${league} (last ${YEARS_BACK} years)...`);
    if (league === "ipl") {
      await backfillCricketViaScoreboard(league);
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
