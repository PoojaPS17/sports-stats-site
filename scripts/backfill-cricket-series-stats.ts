// Manual backfill of per-player figures for one competition's editions, so a historical series page gains
// the stats block it has never had (CricketSeriesLeaders renders nothing without rows). The nightly
// topup-cricket-series-stats.ts only looks back 45 days by design, so every edition older than that has no
// figures at all: production holds the Ranji Trophy across 52 editions (839 matches) and the Sheffield
// Shield across 71 (572 matches) with player stats on one or two of them.
//
// Scoped by ESPN league id, not by date: `--series 8050` takes every edition of the Ranji Trophy. Same
// pipeline as the nightly job (it shares lib/cricket-series-stats.ts), so nothing about how a card is read
// or stored differs here; only which matches are chosen, and the dry run.
//
// ESPN serves cards for older matches than you would expect — a 2012 first-class scorecard parses complete,
// per innings — but not forever, and the cliff has not been measured. Hence --dry-run: it fetches and parses
// exactly as a real run would, writes NOTHING, and prints the card rate by decade. Run it first, read the
// table, then run for real with a --cap that stops before the decade where the cards run out.
//
//   npx tsx --env-file=.env.local scripts/backfill-cricket-series-stats.ts --series 8050 --dry-run --cap 40
//   npx tsx --env-file=.env.local scripts/backfill-cricket-series-stats.ts --series 8050 --cap 900
//
// Exits 1 when any match failed, as the nightly job does.
import { pool } from "./lib/db";
import { decadeTable, summaryLine, topUpCricketSeriesStats, topUpExitCode } from "./lib/cricket-series-stats";

/** Polite pacing: measured at this gap, ESPN answered 7 of 9 old matches first try; faster runs drew 502s. */
const DELAY_MS = 1_500;
const DEFAULT_CAP = 50;

function parseArgs() {
  const args = process.argv.slice(2);
  const opt = (name: string) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const series = opt("series");
  const cap = opt("cap") === undefined ? DEFAULT_CAP : Number(opt("cap"));
  const dryRun = args.includes("--dry-run");
  // A bare ESPN league id: an edition key ("8050-2026-27") would silently match nothing, since the scope
  // compares against the id's own league part.
  if (!series || !/^\d+$/.test(series) || !Number.isInteger(cap) || cap < 1) {
    console.error("usage: backfill-cricket-series-stats.ts --series <espn-league-id> [--cap N] [--dry-run]");
    console.error("  --series takes a bare league id (8050), not an edition key (8050-2026-27)");
    process.exit(2);
  }
  return { series, cap, dryRun };
}

async function main() {
  const { series, cap, dryRun } = parseArgs();
  console.log(`[backfill-cricket-series-stats] series ${series}, cap ${cap}${dryRun ? ", DRY RUN (writes nothing)" : ""}`);
  const result = await topUpCricketSeriesStats({ cap, series, dryRun, delayMs: DELAY_MS });
  console.log(summaryLine(result, cap));
  for (const line of decadeTable(result)) console.log(line);
  if (dryRun) console.log("[backfill-cricket-series-stats] dry run: nothing was written, every match above is still a candidate");
  await pool.end();
  process.exit(topUpExitCode(result));
}

main().catch((err) => {
  console.error("[backfill-cricket-series-stats] failed:", err);
  process.exit(1);
});
