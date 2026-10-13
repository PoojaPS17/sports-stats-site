// One-off: stores the match report (game_details) of completed WPL, WBBL, Women's WC and Women's
// T20 WC games that have player figures but no report, so the proxy can day-cache them. Writes
// game_details only, and only where a game has no report at all. Bounded per run, newest first;
// safe to re-run (a game with a report is never selected). `--dry-run` reads ESPN and the
// database and writes nothing. Exits 1 when any game failed. See lib/cricket-reports-backfill.ts.
//
//   npx tsx --env-file=.env.local scripts/backfill-cricket-reports.ts [--league wpl] [--cap N] [--dry-run]
import { pool } from "./lib/db";
import { DEFAULT_REPORT_CAP, REPORT_BACKFILL_LEAGUES, backfillCricketReports, reportSummaryLine } from "./lib/cricket-reports-backfill";

function parseArgs() {
  const args = process.argv.slice(2);
  const opt = (name: string) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? args[i + 1] : undefined;
  };
  // Every argument must be a known flag or the value of --league / --cap.
  const stray = args.filter((a, i) => (a.startsWith("--") ? !["--league", "--cap", "--dry-run"].includes(a) : args[i - 1] !== "--league" && args[i - 1] !== "--cap"));
  const cap = opt("cap") === undefined ? DEFAULT_REPORT_CAP : Number(opt("cap"));
  const league = opt("league");
  if (stray.length > 0 || !Number.isInteger(cap) || cap < 1 || (league && !(REPORT_BACKFILL_LEAGUES as readonly string[]).includes(league))) {
    console.error(`usage: backfill-cricket-reports.ts [--cap N] [--league ${REPORT_BACKFILL_LEAGUES.join("|")}] [--dry-run]`);
    process.exit(2);
  }
  return { cap, leagues: league ? [league] : undefined, dryRun: args.includes("--dry-run") };
}

async function main() {
  const { cap, leagues, dryRun } = parseArgs();
  const result = await backfillCricketReports({ cap, leagues, dryRun, delayMs: 150 });
  console.log(reportSummaryLine(result, cap, dryRun));
  await pool.end();
  process.exit(result.failed.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("[backfill-cricket-reports] failed:", err);
  process.exit(1);
});
