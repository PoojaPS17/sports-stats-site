// Creates the `players` rows that cricket card rows (player_game_stats) point at but that do not exist. A player
// with no row has no page and adds nothing to a leader board. refresh-cricket-cards.ts left such rows before it
// created players itself (it does now, for every match it re-reads); this fills in the ones it left.
//
// Each such player is read from ESPN's summary of one match they played (their card row names the match). An
// existing player is never touched, nor any card row. A player whose match summary does not list them is reported
// and left. `--dry-run` reads and reports, and writes nothing.
//
//   npx tsx --env-file=.env.local scripts/create-missing-cricket-players.ts <league> [<league> ...] [--dry-run]
import { pool } from "./lib/db";
import { fetchCricketSummary } from "./lib/espn";
import { cricketSummaryPaths } from "../src/lib/cricketSummary";
import { isCricketLeague } from "../src/lib/leagues";
import { extractCricketMatchStats } from "./lib/cricket-career";
import { createMissingCricketPlayers } from "./lib/cricket-cards-refresh";

const REQUEST_DELAY_MS = 120;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const leagues = args.filter((a) => !a.startsWith("--"));
  const unknown = [...args.filter((a) => a.startsWith("--") && a !== "--dry-run"), ...leagues.filter((l) => !isCricketLeague(l as never))];
  if (leagues.length === 0 || unknown.length > 0) {
    console.error(`create-missing-cricket-players: ${unknown.length > 0 ? `unknown: ${unknown.join(", ")}` : "no league given"}\nusage: create-missing-cricket-players.ts <cricket league> [...] [--dry-run]`);
    process.exit(1);
  }

  let failed = 0;
  let missing = 0;
  for (const league of leagues) {
    // One match per missing player, the latest they played (so the club is their latest); a match several of them played is read once.
    const { rows } = await pool.query(
      `select s.player_espn_id, (array_agg(s.game_espn_id order by g.date desc nulls last, s.game_espn_id))[1] as game_espn_id
       from player_game_stats s
       left join games g on g.league = s.league and g.espn_id = s.game_espn_id
       where s.league = $1 and not exists (select 1 from players p where p.league = s.league and p.espn_id = s.player_espn_id)
       group by s.player_espn_id`,
      [league]
    );
    const byGame = new Map<string, Set<string>>();
    for (const r of rows) byGame.set(r.game_espn_id, (byGame.get(r.game_espn_id) ?? new Set()).add(r.player_espn_id));
    let created = 0;
    let notFound = 0;
    for (const [game, wanted] of byGame) {
      try {
        const { players } = extractCricketMatchStats(await fetchCricketSummary(game, cricketSummaryPaths(undefined)));
        const found = players.filter((p) => wanted.has(p.athleteId));
        for (const id of wanted) {
          if (found.some((p) => p.athleteId === id)) continue;
          notFound++;
          console.error(`[create-missing-cricket-players] ${league} player ${id} is not in the summary of match ${game}`);
        }
        if (dryRun) for (const p of found) console.log(`[dry-run] ${league} ${p.athleteId} ${p.name} (match ${game})`);
        else created += await createMissingCricketPlayers(pool, league, found);
      } catch (err) {
        failed++;
        console.error(`[create-missing-cricket-players] ${league} match ${game} failed: ${err instanceof Error ? err.message : err}`);
      }
      await sleep(REQUEST_DELAY_MS);
    }
    missing += notFound;
    console.log(`[create-missing-cricket-players] ${league}: ${rows.length} players without a players row in ${byGame.size} matches; ${dryRun ? "none written (dry run)" : `${created} created`}, ${notFound} not in their match's summary`);
  }
  await pool.end();
  if (failed > 0 || missing > 0) {
    console.error(`[create-missing-cricket-players] ${failed} match(es) failed, ${missing} player(s) not found in their match's summary${failed > 0 ? "; run it again" : ""}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("[create-missing-cricket-players] failed:", err);
  process.exit(1);
});
