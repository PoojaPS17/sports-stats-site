// Daily top-up of cricket player figures and match reports: completed ESPN-fed games with no
// player_game_stats rows are read from ESPN and stored, bounded per run. Idempotent: it only
// ever touches games with no player rows, and never rewrites one that has them (nor a
// match whose stored report is Cricsheet's). Exits 1 with a summary line when any game
// failed, so the scrape job records it. See lib/cricket-topup.ts.
//
//   npx tsx --env-file=.env.local scripts/topup-cricket-player-stats.ts [--cap N] [--league wpl]
import { pool } from "./lib/db";
import { DEFAULT_TOPUP_CAP, TOPUP_LEAGUES, summaryLine, topUpCricketPlayerStats, topUpExitCode } from "./lib/cricket-topup";

function parseArgs() {
  const args = process.argv.slice(2);
  const opt = (name: string) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const cap = opt("cap") === undefined ? DEFAULT_TOPUP_CAP : Number(opt("cap"));
  const league = opt("league");
  if (!Number.isInteger(cap) || cap < 1 || (league && !(TOPUP_LEAGUES as readonly string[]).includes(league))) {
    console.error(`usage: topup-cricket-player-stats.ts [--cap N] [--league ${TOPUP_LEAGUES.join("|")}]`);
    process.exit(2);
  }
  return { cap, leagues: league ? [league] : undefined };
}

async function main() {
  const { cap, leagues } = parseArgs();
  const result = await topUpCricketPlayerStats({ cap, leagues, delayMs: 150 });
  console.log(summaryLine(result, cap));
  await pool.end();
  process.exit(topUpExitCode(result));
}

main().catch((err) => {
  console.error("[topup-cricket-player-stats] failed:", err);
  process.exit(1);
});
