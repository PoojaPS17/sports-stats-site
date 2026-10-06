// Top-up of per-player figures for matches in series SportsDB does not archive under a competition:
// finished matches with no rows in cricket_series_player_stats are read from ESPN and stored, bounded
// per run, newest first, so the series page's stats block (most runs, most wickets) never lags a
// match for long. Idempotent: it only touches matches with no rows. Exits 1 with a summary line when
// any match failed, so the scrape job records it. See lib/cricket-series-stats.ts.
//
//   npx tsx --env-file=.env.local scripts/topup-cricket-series-stats.ts [--cap N] [--since-days D]
//   npx tsx --env-file=.env.local scripts/topup-cricket-series-stats.ts --cap 500 --since-days 120   # backfill
import { pool } from "./lib/db";
import { DEFAULT_SERIES_STATS_CAP, DEFAULT_SINCE_DAYS, summaryLine, topUpCricketSeriesStats, topUpExitCode } from "./lib/cricket-series-stats";

function parseArgs() {
  const args = process.argv.slice(2);
  const opt = (name: string) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const cap = opt("cap") === undefined ? DEFAULT_SERIES_STATS_CAP : Number(opt("cap"));
  const sinceDays = opt("since-days") === undefined ? DEFAULT_SINCE_DAYS : Number(opt("since-days"));
  if (!Number.isInteger(cap) || cap < 1 || !Number.isInteger(sinceDays) || sinceDays < 1) {
    console.error("usage: topup-cricket-series-stats.ts [--cap N] [--since-days D]");
    process.exit(2);
  }
  return { cap, sinceDays };
}

async function main() {
  const { cap, sinceDays } = parseArgs();
  const result = await topUpCricketSeriesStats({ cap, sinceDays, delayMs: 150 });
  console.log(summaryLine(result, cap));
  await pool.end();
  process.exit(topUpExitCode(result));
}

main().catch((err) => {
  console.error("[topup-cricket-series-stats] failed:", err);
  process.exit(1);
});
