// One-off (safe to re-run): stores the local match day(s) on the international cricket games that were
// imported before games.local_date / end_date existed. One ESPN summary request per game whose
// local_date is still empty, about 7 a second at most; a re-run picks up where a stopped one left off.
//
//   npm run backfill:cricket-dates [league ...] [--limit N]
//
// With no league: test wodi wt20i odi t20i. The eight scoreboard competitions (IPL, BBL, WPL, WBBL and
// the World Cups) are filled by `npm run backfill:games <league> [seasons]` instead.
import { pool } from "./lib/db";
import { DATE_BACKFILL_LEAGUES, backfillCricketDates, parseDateBackfillArgs } from "./lib/cricket-date-backfill";

async function main() {
  const { ok, leagues, limit } = parseDateBackfillArgs(process.argv.slice(2));
  if (!ok) {
    console.error(`usage: backfill-cricket-dates.ts [${DATE_BACKFILL_LEAGUES.join("|")} ...] [--limit N]`);
    process.exit(1);
  }
  const result = await backfillCricketDates(leagues, { limit });
  console.log(`[backfill-cricket-dates] ${result.candidates} games without a local date: ${result.dated} dated from the feed, ${result.fallback} with no date in the feed (UTC day kept), ${result.failed} failed`);
  await pool.end();
  if (result.failed > 0) process.exitCode = 1;
}

main().catch(async (err) => {
  console.error("[backfill-cricket-dates] failed:", err instanceof Error ? err.message : err);
  await pool.end().catch(() => {});
  process.exit(1);
});
