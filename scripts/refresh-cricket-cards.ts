// Rewrites the per-player match figures (player_game_stats.stats) of stored cricket
// matches from a fresh read of ESPN's summary, without touching games, teams or
// players. For when the extraction in lib/cricket-career.ts changes: the figures are
// derived data, and every read-side total is computed from them. Rows are stamped with
// the extractor's version, so a re-run only visits matches not yet brought up to date.
// Rows the extractor now stores that an older run did not (a player in the XI with no
// figures) are inserted; existing rows are updated.
//
// The stored match report is rebuilt too: only its `scorecard` key is replaced, with what
// the current parser makes of the same summary (an older parser left out a not-out batter
// who never faced a ball). Every other key stays.
//
//   npx tsx --env-file=.env.local scripts/refresh-cricket-cards.ts <league> [--espn-cards-only] [--since-year YYYY] [--dry-run]
//
// A match whose stored report was built from Cricsheet (its batting rows carry no dismissal
// text, and none of its cards carries the extractor's version stamp) is never touched. ODIs,
// T20Is, IPL and BBL mix both sources, and a Cricsheet match's cards are computed ball by ball:
// ESPN's derived figures must never replace them, so those matches are skipped and the count is
// printed. An IPL or BBL report stored by ESPN before fe9fbff has no dismissal text either, but
// its cards are stamped, so it is ESPN's: it is refreshed and its report rebuilt. A match with
// no stored report is ESPN-only (the Cricsheet importer always stores one): its cards are
// refreshed, and no report is created for it. `--espn-cards-only` is therefore always on; the flag is still accepted,
// and does nothing, so command lines that carry it keep working.
//
// A match is also left entirely alone (counted, one line each) when the rebuilt report
// would be thinner than the stored one (fewer batting rows, or no innings totals where the
// stored one has them): that is a degraded ESPN response. A summary that lacks its
// competitors, or its match class for a Test, fails and is retried on a later run.
// `--dry-run` reads ESPN and the database, prints what would change and writes nothing.
// Arguments are checked strictly: exactly one cricket league and only the flags above.
import { pool } from "./lib/db";
import { CARD_VERSION } from "./lib/cricket-career";
import { REFRESH_USAGE, parseRefreshArgs, refreshMatchCards } from "./lib/cricket-cards-refresh";
import { CRICSHEET_REPORT_SQL } from "./lib/cricsheet-report";
import { baseSeriesId } from "../src/lib/cricketSeriesKey";

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
  // A tournament series is keyed by edition since Task 11 ("8044-2025-26"), but ESPN's summary path wants the bare
  // league id. baseSeriesId is the same leading-id rule cricket-topup.ts and import-cricket-espn.ts apply in SQL.
  const { rows } = await pool.query(`select series_espn_id from cricket_series_matches where espn_id = $1`, [eventId]);
  return rows[0] ? getJson(SUMMARY_URL(baseSeriesId(String(rows[0].series_espn_id)), eventId)) : summary;
}

async function main() {
  const parsed = parseRefreshArgs(process.argv.slice(2));
  if ("error" in parsed) {
    console.error(`refresh-cricket-cards: ${parsed.error}\n${REFRESH_USAGE}`);
    process.exit(1);
  }
  const { league, dryRun, sinceYear } = parsed;

  // `cricsheet_report`: the stored match report came from Cricsheet. Those matches are counted and left
  // alone without a request (refreshMatchCards checks this again before writing).
  const { rows: games } = await pool.query(
    `select g.espn_id, g.date, exists (
         select 1 from game_details d where d.league = g.league and d.game_espn_id = g.espn_id and ${CRICSHEET_REPORT_SQL}) as cricsheet_report
     from games g
     where g.league = $1 and g.completed
       and ($2::int is null or g.season_year >= $2)
       and exists (select 1 from player_game_stats s where s.league = g.league and s.game_espn_id = g.espn_id and coalesce((s.stats ->> 'v')::int, 1) < $3)
     order by g.date asc`,
    [league, sinceYear, CARD_VERSION]
  );
  const todo = games.filter((g) => !g.cricsheet_report);
  const cricsheet = games.length - todo.length;
  console.log(`[refresh-cricket-cards] ${league}: ${todo.length} matches to re-read${dryRun ? " (dry run, nothing is written)" : ""}; ${cricsheet} skipped because the stored report is Cricsheet's (Cricsheet cards are never overwritten)`);

  let done = 0;
  let failed = 0;
  let inserted = 0;
  let updated = 0;
  let duplicates = 0;
  let orphans = 0;
  let reports = 0;
  let skipped = 0;
  for (const { espn_id, date } of todo) {
    const day = new Date(date).toISOString().slice(0, 10);
    try {
      const r = await refreshMatchCards(pool, league, espn_id, await fetchSummary(espn_id), { dryRun });
      if (r.skipped) {
        skipped++;
        console.log(`[refresh-cricket-cards] ${league} ${espn_id} ${day}: skipped, ${r.skipped}`);
      } else {
        inserted += r.inserted;
        updated += r.updated;
        duplicates += r.duplicates;
        orphans += r.orphans;
        if (r.battingRows) reports++;
        if (dryRun) console.log(`[dry-run] ${league} ${espn_id} ${day}: ${r.inserted} rows to insert, ${r.updated} to update${r.duplicates ? `, ${r.duplicates} already stored under another id` : ""}, ${r.battingRows ? `report batting rows ${r.battingRows.before} -> ${r.battingRows.after}` : "no stored report to rebuild"}`);
        done++;
      }
    } catch (err) {
      failed++;
      console.error(`[refresh-cricket-cards] ${league} ${espn_id} failed: ${err instanceof Error ? err.message : err}`);
    }
    if ((done + skipped + failed) % 200 === 0) console.log(`[refresh-cricket-cards] ${league}: ${done + skipped + failed}/${todo.length}, ${skipped} skipped, ${failed} failed`);
    await sleep(REQUEST_DELAY_MS);
  }
  console.log(
    `[refresh-cricket-cards] ${league}: ${dryRun ? "would refresh" : "refreshed"} ${done}/${todo.length} matches, ${inserted} player rows ${dryRun ? "to insert" : "inserted"}, ${updated} ${dryRun ? "to rewrite" : "rewritten"}, ${reports} reports ${dryRun ? "to rebuild" : "rebuilt"}; ${cricsheet} skipped (Cricsheet report), ${skipped} skipped (rebuilt report thinner), ${failed} failed`
  );
  // A real run creates the players it finds without a `players` row (an existing player is never changed).
  console.log(`[refresh-cricket-cards] ${league}: ${orphans} of the ${dryRun ? "rows to insert" : "inserted rows"} had a player with no players row${dryRun ? "" : ", created now"}; ${duplicates} ${dryRun ? "would be" : "were"} left out because the match already has a row for the same name and side under another id`);
  await pool.end();
}

main().catch((err) => {
  console.error("[refresh-cricket-cards] failed:", err);
  process.exit(1);
});
