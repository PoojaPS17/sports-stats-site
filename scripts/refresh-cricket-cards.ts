// Rewrites the per-player match figures (player_game_stats.stats) of stored cricket
// matches from a fresh read of ESPN's summary, without touching games, teams or
// players. For when the extraction in lib/cricket-career.ts changes: the figures are
// derived data, and every read-side total is computed from them. Rows are stamped with
// the extractor's version, so a re-run only visits matches not yet brought up to date.
// Rows the extractor now stores that an older run did not (a player in the XI with no
// figures) are inserted; existing rows are updated.
//
// The stored match report is rebuilt too, when it was fed by ESPN: only its `scorecard`
// key is replaced, with what the current parser makes of the same summary (an older
// parser left out a not-out batter who never faced a ball). Every other key stays.
//
//   npx tsx --env-file=.env.local scripts/refresh-cricket-cards.ts <league> [--espn-cards-only] [--since-year YYYY] [--dry-run]
//
// `--espn-cards-only` skips matches whose stored scorecard came from Cricsheet (ODIs
// and T20Is mix both sources; Cricsheet's figures are computed ball by ball and do
// not pass through the extractor). An ESPN card is recognised by its dismissal text.
// `--dry-run` reads ESPN and the database, prints what would change and writes nothing.
import { pool } from "./lib/db";
import { CARD_VERSION } from "./lib/cricket-career";
import { refreshMatchCards } from "./lib/cricket-cards-refresh";

const SUMMARY_URL = (seriesId: string, eventId: string) => `https://site.api.espn.com/apis/site/v2/sports/cricket/${seriesId}/summary?event=${eventId}`;
// Same as import-cricket-espn.ts: ESPN's summary endpoint resolves any cricket event
// under any competition id in the path, and this one serves Tests, women's and domestic
// matches as fully as the men's limited-overs internationals. Only when it returns a
// copy with no competitors is the match's own series id (from the daily listing) tried.
const FALLBACK_SERIES = "8048";
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

async function fetchSummary(eventId: string): Promise<any> {
  const summary = await getJson(SUMMARY_URL(FALLBACK_SERIES, eventId));
  if (summary?.header?.competitions?.[0]?.competitors?.length) return summary;
  const { rows } = await pool.query(`select series_espn_id from cricket_series_matches where espn_id = $1`, [eventId]);
  return rows[0] ? getJson(SUMMARY_URL(rows[0].series_espn_id, eventId)) : summary;
}

async function main() {
  const args = process.argv.slice(2);
  const league = args.find((a) => !a.startsWith("--"));
  if (!league) {
    console.error("usage: refresh-cricket-cards.ts <league> [--espn-cards-only] [--since-year YYYY] [--dry-run]");
    process.exit(1);
  }
  const espnOnly = args.includes("--espn-cards-only");
  const dryRun = args.includes("--dry-run");
  const sinceIdx = args.indexOf("--since-year");
  const sinceYear = sinceIdx >= 0 ? Number(args[sinceIdx + 1]) : null;

  // `espn_report`: the stored match report came from ESPN (its rows carry dismissal text),
  // so it can be rebuilt from the summary; a Cricsheet report is not ours to rewrite.
  const { rows: games } = await pool.query(
    `select g.espn_id, g.date, exists (
         select 1 from game_details d where d.league = g.league and d.game_espn_id = g.espn_id
           and d.details -> 'scorecard' -> 0 -> 'battingRows' -> 0 ? 'dismissal') as espn_report
     from games g
     where g.league = $1 and g.completed
       and ($3::int is null or g.season_year >= $3)
       and exists (select 1 from player_game_stats s where s.league = g.league and s.game_espn_id = g.espn_id and coalesce((s.stats ->> 'v')::int, 1) < $4)
       and ($2 = false or exists (
         select 1 from game_details d where d.league = g.league and d.game_espn_id = g.espn_id
           and d.details -> 'scorecard' -> 0 -> 'battingRows' -> 0 ? 'dismissal'))
     order by g.date asc`,
    [league, espnOnly, sinceYear, CARD_VERSION]
  );
  console.log(`[refresh-cricket-cards] ${league}: ${games.length} matches to re-read${dryRun ? " (dry run, nothing is written)" : ""}`);

  let done = 0;
  let failed = 0;
  let inserted = 0;
  let updated = 0;
  let reports = 0;
  for (const { espn_id, date, espn_report } of games) {
    try {
      const r = await refreshMatchCards(pool, league, espn_id, await fetchSummary(espn_id), { rewriteScorecard: espn_report, dryRun });
      inserted += r.inserted;
      updated += r.updated;
      if (r.battingRows) reports++;
      if (dryRun) {
        const report = r.battingRows ? `report batting rows ${r.battingRows.before} -> ${r.battingRows.after}` : "report left alone";
        console.log(`[dry-run] ${league} ${espn_id} ${new Date(date).toISOString().slice(0, 10)}: ${r.inserted} rows to insert, ${r.updated} to update, ${report}`);
      }
      done++;
    } catch (err) {
      failed++;
      console.error(`[refresh-cricket-cards] ${league} ${espn_id} failed: ${err instanceof Error ? err.message : err}`);
    }
    if ((done + failed) % 200 === 0) console.log(`[refresh-cricket-cards] ${league}: ${done + failed}/${games.length}, ${failed} failed`);
    await sleep(REQUEST_DELAY_MS);
  }
  console.log(
    `[refresh-cricket-cards] ${league}: ${dryRun ? "would re-read" : "re-read"} ${done}/${games.length} matches, ${inserted} player rows ${dryRun ? "to insert" : "inserted"}, ${updated} ${dryRun ? "to rewrite" : "rewritten"}, ${reports} reports ${dryRun ? "to rebuild" : "rebuilt"}, ${failed} failed`
  );
  await pool.end();
}

main().catch((err) => {
  console.error("[refresh-cricket-cards] failed:", err);
  process.exit(1);
});
