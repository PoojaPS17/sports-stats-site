// Rewrites the per-player match figures (player_game_stats.stats) of stored cricket
// matches from a fresh read of ESPN's summary, without touching games, teams or
// players. For when the extraction in lib/cricket-career.ts changes: the figures are
// derived data, and every read-side total is computed from them. Rows are stamped with
// the extractor's version, so a re-run only visits matches not yet brought up to date.
//
//   npx tsx --env-file=.env.local scripts/refresh-cricket-cards.ts <league> [--espn-cards-only] [--since-year YYYY]
//
// `--espn-cards-only` skips matches whose stored scorecard came from Cricsheet (ODIs
// and T20Is mix both sources; Cricsheet's figures are computed ball by ball and do
// not pass through the extractor). An ESPN card is recognised by its dismissal text.
import { pool } from "./lib/db";
import { CARD_VERSION, extractCricketMatchStats } from "./lib/cricket-career";

const SUMMARY_URL = (eventId: string) => `https://site.api.espn.com/apis/site/v2/sports/cricket/8048/summary?event=${eventId}`;
const REQUEST_DELAY_MS = 120;
const RETRIES = 4;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getJson(url: string): Promise<any> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < RETRIES; attempt++) {
    try {
      const res = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(20_000) });
      const data = JSON.parse(await res.text());
      if (data?.rosters || data?.header) return data;
      throw new Error(`no summary in response (${JSON.stringify(data).slice(0, 100)})`);
    } catch (err) {
      lastErr = err;
      await sleep(1000 * (attempt + 1));
    }
  }
  throw lastErr;
}

async function main() {
  const args = process.argv.slice(2);
  const league = args.find((a) => !a.startsWith("--"));
  if (!league) {
    console.error("usage: refresh-cricket-cards.ts <league> [--espn-cards-only] [--since-year YYYY]");
    process.exit(1);
  }
  const espnOnly = args.includes("--espn-cards-only");
  const sinceIdx = args.indexOf("--since-year");
  const sinceYear = sinceIdx >= 0 ? Number(args[sinceIdx + 1]) : null;

  const { rows: games } = await pool.query(
    `select g.espn_id from games g
     where g.league = $1 and g.completed
       and ($3::int is null or g.season_year >= $3)
       and exists (select 1 from player_game_stats s where s.league = g.league and s.game_espn_id = g.espn_id and coalesce((s.stats ->> 'v')::int, 1) < $4)
       and ($2 = false or exists (
         select 1 from game_details d where d.league = g.league and d.game_espn_id = g.espn_id
           and d.details -> 'scorecard' -> 0 -> 'battingRows' -> 0 ? 'dismissal'))
     order by g.date asc`,
    [league, espnOnly, sinceYear, CARD_VERSION]
  );
  console.log(`[refresh-cricket-cards] ${league}: ${games.length} matches to re-read`);

  let done = 0;
  let failed = 0;
  let rows = 0;
  for (const { espn_id } of games) {
    try {
      const { players } = extractCricketMatchStats(await getJson(SUMMARY_URL(espn_id)));
      // An empty read is a bad response, not a match nobody played in: leave the row be.
      if (players.length === 0) throw new Error("summary has no player figures");
      await pool.query(
        `update player_game_stats s set stats = r.stats::jsonb, updated_at = now()
         from unnest($3::text[], $4::text[]) as r(id, stats)
         where s.league = $1 and s.game_espn_id = $2 and s.player_espn_id = r.id`,
        [league, espn_id, players.map((p) => p.athleteId), players.map((p) => JSON.stringify({ batting: p.batting, bowling: p.bowling, catches: p.catches, innings: p.innings, v: CARD_VERSION }))]
      );
      rows += players.length;
      done++;
    } catch (err) {
      failed++;
      console.error(`[refresh-cricket-cards] ${league} ${espn_id} failed: ${err instanceof Error ? err.message : err}`);
    }
    if ((done + failed) % 200 === 0) console.log(`[refresh-cricket-cards] ${league}: ${done + failed}/${games.length}, ${failed} failed`);
    await sleep(REQUEST_DELAY_MS);
  }
  console.log(`[refresh-cricket-cards] ${league}: re-read ${done}/${games.length} matches, ${rows} player rows rewritten, ${failed} failed`);
  await pool.end();
}

main().catch((err) => {
  console.error("[refresh-cricket-cards] failed:", err);
  process.exit(1);
});
