/* eslint-disable @typescript-eslint/no-explicit-any -- fixtures shaped like raw ESPN JSON */
import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { startTestDb, type TestDb } from "./helpers/testDb";
import { outcome } from "./helpers/nextErrors";

// ESPN's league id for a recurring tournament (BBL 8044, WBBL 21284, ...) is the same every season, so keying
// cricket_series by it merged every edition into one series ("Big Bash League Jan 1, 2025 - Dec 19, 2026 - 73 matches").
// A tournament is now one series per edition, id `<league id>-<season>` ("8044-2025-26"), the season being the label
// ESPN's own header event carries (notes[type=season], "2025/26"). A bilateral tour already has its own id per tour.
//
// The fixture is real ESPN daily-listing output (site.web.api.espn.com/apis/v2/scoreboard/header?sport=cricket&dates=...),
// trimmed to the fields the script reads:
//   20241231, 20250101  BBL 2024-25 (3 matches)        20251230, 20260105  BBL 2025-26 (2 matches) + a WT20I of the India Women tour (24046)
//   20251201            WBBL 2025-26 (1 match)          20260215            ICC Men's T20 World Cup, event season 2026 but note 2025/26
//   20240515            IPL 2024 (1 match)
const DAYS: Record<string, any> = JSON.parse(readFileSync(resolve(process.cwd(), "tests/fixtures/espn-cricket-header-days.json"), "utf8"));

let db: TestDb;
let key: typeof import("../src/lib/cricketSeriesKey");
let ingest: typeof import("../scripts/lib/cricket-series-ingest");
let series: typeof import("../src/lib/cricketSeries");
let featured: typeof import("../src/lib/cricketFeatured");
let topup: typeof import("../scripts/lib/cricket-topup");
let importer: typeof import("../scripts/import-cricket-espn");
let sitemap: typeof import("../src/lib/sitemap");
let page: typeof import("../src/app/cricket/series/[id]/page");
const realFetch = globalThis.fetch;

before(async () => {
  db = await startTestDb();
  key = await import("../src/lib/cricketSeriesKey");
  ingest = await import("../scripts/lib/cricket-series-ingest");
  series = await import("../src/lib/cricketSeries");
  featured = await import("../src/lib/cricketFeatured");
  topup = await import("../scripts/lib/cricket-topup");
  importer = await import("../scripts/import-cricket-espn");
  sitemap = await import("../src/lib/sitemap");
  page = await import("../src/app/cricket/series/[id]/page");
});
after(async () => {
  globalThis.fetch = realFetch;
  await (await import("../src/lib/db")).pool.end();
  await db?.stop();
});
beforeEach(async () => {
  globalThis.fetch = realFetch;
  for (const t of ["cricket_series_matches", "cricket_series", "games"]) await db.pool.query(`delete from ${t}`);
});

const league = (day: string, id: string) => DAYS[day].sports[0].leagues.find((l: any) => String(l.id) === id);
const events = (day: string, id: string): any[] => league(day, id).events;

/** The script's own steps for the given listing days: read each day, store its matches, then the series rows. */
async function run(days: string[]) {
  const meta: import("../scripts/lib/cricket-series-ingest").SeriesMap = new Map();
  for (const day of days) await ingest.storeMatches(ingest.ingestDay(DAYS[day], meta));
  await ingest.storeSeries(meta);
  return meta;
}
const seriesRow = async (id: string) => (await db.pool.query(`select * from cricket_series where espn_id = $1`, [id])).rows[0];
const utc = (v: Date) => v.toISOString();

/* --------------------------------- the key --------------------------------- */

test("a tournament's edition is the season label of ESPN's own event, in the series id", () => {
  const bbl = league("20251230", "8044");
  assert.deepEqual(key.seriesEdition(bbl, bbl.events[0]), { id: "8044-2025-26", label: "2025-26", edition: true });
  const bbl24 = league("20241231", "8044");
  assert.equal(key.seriesEdition(bbl24, bbl24.events[0]).id, "8044-2024-25");
  // A calendar-year season is just the year.
  const ipl = league("20240515", "8048");
  assert.deepEqual(key.seriesEdition(ipl, ipl.events[0]), { id: "8048-2024", label: "2024", edition: true });
  // The T20 World Cup 2026 is a 2025/26 season on Cricinfo; the event's numeric `season` (2026) is not the edition.
  const wc = league("20260215", "8604");
  assert.equal(wc.events[0].season, 2026);
  assert.equal(key.seriesEdition(wc, wc.events[0]).id, "8604-2025-26");
});

test("a bilateral series keeps its own ESPN id, whatever season its events carry", () => {
  const tour = league("20251230", "24046");
  assert.equal(tour.isTournament, false);
  assert.deepEqual(key.seriesEdition(tour, tour.events[0]), { id: "24046", label: null, edition: false });
});

test("the edition falls back to the event's season year, then its date, and the archived leagues are editions whatever the flag says", () => {
  const lg = { id: "8044", name: "Big Bash League", isTournament: false };
  assert.equal(key.seriesEdition(lg, { season: 2025, date: "2026-01-05T08:00:00Z", notes: [] }).id, "8044-2025");
  assert.equal(key.seriesEdition(lg, { date: "2026-01-05T08:00:00Z" }).id, "8044-2026");
  assert.equal(key.seriesEdition({ id: "12345", isTournament: true }, { season: 2025, notes: [{ type: "season", text: "2025/26" }] }).id, "12345-2025-26");
  assert.equal(key.seriesEdition({ id: "12345", isTournament: false }, { season: 2025, notes: [{ type: "season", text: "2025/26" }] }).id, "12345");
});

test("baseSeriesId is the ESPN league id an edition key stands for", () => {
  assert.equal(key.baseSeriesId("8044-2025-26"), "8044");
  assert.equal(key.baseSeriesId("8044"), "8044");
  assert.equal(key.baseSeriesId("24046"), "24046");
  // Every script that sends a stored series id to ESPN must strip the edition first, or a tournament match
  // 404s on ".../8044-2025-26/summary". The two SQL readers do it with split_part; the card refresh calls
  // baseSeriesId. If a third way appears, this is the test that should catch it.
  const refresh = readFileSync(resolve(process.cwd(), "scripts/refresh-cricket-cards.ts"), "utf8");
  assert.match(refresh, /SUMMARY_URL\(baseSeriesId\(/, "refresh-cricket-cards must strip the edition from a composite series key");
  for (const f of ["scripts/lib/cricket-topup.ts", "scripts/import-cricket-espn.ts"]) {
    assert.match(readFileSync(resolve(process.cwd(), f), "utf8"), /split_part\(m\.series_espn_id, '-', 1\)/, `${f} reads the leading id`);
  }
});

test("the series title carries the edition once", () => {
  assert.equal(key.seriesTitle("Big Bash League", "2025-26"), "Big Bash League 2025-26");
  assert.equal(key.seriesTitle("Big Bash League", null), "Big Bash League");
  assert.equal(key.seriesTitle("Asia Cup 2025", "2025"), "Asia Cup 2025");
  assert.equal(key.seriesTitle("Big Bash League 2025/26", "2025-26"), "Big Bash League 2025/26");
});

/* ------------------------------ the stored series ------------------------------ */

test("two editions of one league id are two series, each with its own span, count and title", async () => {
  await run(["20241231", "20250101", "20251230", "20260105"]);
  const rows = (await db.pool.query(`select espn_id from cricket_series where espn_id like '8044%' order by espn_id`)).rows.map((r) => r.espn_id);
  assert.deepEqual(rows, ["8044-2024-25", "8044-2025-26"]);

  const old = await seriesRow("8044-2024-25");
  const cur = await seriesRow("8044-2025-26");
  assert.equal(old.name, "Big Bash League 2024-25");
  assert.equal(cur.name, "Big Bash League 2025-26");
  assert.equal(old.match_count, 3);
  assert.equal(cur.match_count, 2);
  const oldDates = [...events("20241231", "8044"), ...events("20250101", "8044")].map((e) => e.date).sort();
  const curDates = [...events("20251230", "8044"), ...events("20260105", "8044")].map((e) => e.date).sort();
  assert.equal(utc(old.start_date), new Date(oldDates[0]).toISOString());
  assert.equal(utc(old.end_date), new Date(oldDates.at(-1)!).toISOString());
  assert.equal(utc(cur.start_date), new Date(curDates[0]).toISOString());
  assert.equal(utc(cur.end_date), new Date(curDates.at(-1)!).toISOString());
  assert.equal(old.season, 2024);
  assert.equal(cur.season, 2025);
  // The matches are filed under their edition.
  const filed = (await db.pool.query(`select series_espn_id, count(*)::int as n from cricket_series_matches group by 1 order by 1`)).rows.filter((r) => r.series_espn_id.startsWith("8044"));
  assert.deepEqual(filed.map((r) => [r.series_espn_id, r.n]), [["8044-2024-25", 3], ["8044-2025-26", 2]]);
});

test("the women's league is its own set of editions and a bilateral series is stored exactly as before", async () => {
  await run(["20251201", "20251230"]);
  assert.equal((await seriesRow("21284-2025-26")).name, "Women's Big Bash League 2025-26");
  const tour = await seriesRow("24046");
  assert.equal(tour.name, "Sri Lanka Women tour of India [Dec 2025] 2025/26");
  assert.equal(tour.match_count, 1);
  assert.equal(tour.is_tournament, false);
  assert.equal((await db.pool.query(`select count(*)::int as n from cricket_series where espn_id = '21284' or espn_id = '8044'`)).rows[0].n, 0);
});

test("running the same days again changes nothing", async () => {
  await run(["20241231", "20250101", "20251230", "20260105", "20251230"]);
  const before = (await db.pool.query(`select espn_id, name, match_count, start_date, end_date from cricket_series order by espn_id`)).rows;
  await run(["20241231", "20250101", "20251230", "20260105"]);
  const after = (await db.pool.query(`select espn_id, name, match_count, start_date, end_date from cricket_series order by espn_id`)).rows;
  assert.deepEqual(after, before);
  assert.equal((await db.pool.query(`select count(*)::int as n from cricket_series_matches`)).rows[0].n, 3 + 2 + 1);
});

test("a re-run refiles the matches of an old merged series and the same run deletes the emptied row; a league it did not reach keeps its row", async () => {
  // Before the change: one row per league id, holding every edition's matches.
  await db.pool.query(
    `insert into cricket_series (espn_id, name, is_tournament, kind, match_count, start_date, end_date) values
       ('8044', 'Big Bash League', true, 'domestic', 5, '2024-12-31', '2026-01-05'),
       ('8050', 'Ranji Trophy', true, 'domestic', 1, '2024-12-31', '2024-12-31')`
  );
  for (const e of [...events("20241231", "8044"), ...events("20250101", "8044"), ...events("20251230", "8044"), ...events("20260105", "8044")]) {
    await db.pool.query(`insert into cricket_series_matches (espn_id, series_espn_id, date, name) values ($1, '8044', $2, $3)`, [e.id, e.date, e.name]);
  }
  // One match no re-run window reaches: its legacy row must survive.
  await db.pool.query(`insert into cricket_series_matches (espn_id, series_espn_id, date, name) values ('7', '8050', '2024-12-31', 'x v y')`);

  const check = (await db.pool.query(ingest.LEGACY_MERGED_SERIES_CHECK_SQL)).rows;
  assert.deepEqual(check.map((r) => r.espn_id).sort(), ["8044", "8050"]);

  await run(["20241231", "20250101", "20251230", "20260105"]);
  const checkAfter = (await db.pool.query(ingest.LEGACY_MERGED_SERIES_CHECK_SQL)).rows;
  // The run emptied and deleted the old 8044 row itself; 8050 (not a league the run touched, and still holding a match) stays.
  assert.deepEqual(checkAfter.map((r) => [r.espn_id, r.matches]), [["8050", 1]]);

  // The owner's tidy-up is now only a safety net: it finds nothing to delete and never touches a row that holds a match.
  assert.deepEqual((await db.pool.query(ingest.LEGACY_MERGED_SERIES_DELETE_SQL)).rows, []);
  const left = (await db.pool.query(`select espn_id from cricket_series order by espn_id`)).rows.map((r) => r.espn_id);
  // The bilateral tour (24046, on the 2025-12-30 listing) is not a merged row and is not touched.
  assert.deepEqual(left, ["24046", "8044-2024-25", "8044-2025-26", "8050"]);
});

/* ------------------------- every reader of the series id ------------------------- */

test("an edition is the competition its league id names: hub link, featured, and the ESPN league path", async () => {
  await run(["20251230"]);
  const cur = await series.getCricketSeries("8044-2025-26");
  assert.equal(cur?.league, "bbl");
  assert.equal(cur?.featured, true);
  assert.equal(featured.isFeaturedCricket({ series_espn_id: "8044-2025-26", international_class_id: "0" }), true);
  assert.equal(featured.isFeaturedCricket({ series_espn_id: "8050-2025-26", international_class_id: "0" }), false);
  const live = await series.getCricketSeriesMatches("8044-2025-26");
  assert.equal(live.length, 1);
  assert.equal(live[0].series_name, "Big Bash League 2025-26");
  assert.equal(live[0].scorecard_league, null); // no stored game in this test
  // The header listing's live matches are filed under the same key, or the series page's overlay would drop them.
  const urls: string[] = [];
  globalThis.fetch = (async (input: any) => {
    urls.push(String(input));
    return new Response("{}", { status: 500 });
  }) as typeof fetch;
  const { fetchCricketSummaryLive } = await import("../src/lib/cricketLive");
  assert.equal(await fetchCricketSummaryLive("1493253", "8044-2025-26"), null);
  assert.match(urls[0], /\/cricket\/8044\/summary\?event=1493253$/);
});

test("the featured SQL recognises an edition's matches and series, and not another league's", async () => {
  await run(["20251230", "20251201"]);
  await db.pool.query(
    `insert into cricket_series (espn_id, name, kind) values ('8050-2025-26', 'Ranji Trophy 2025-26', 'domestic')`
  );
  await db.pool.query(`insert into cricket_series_matches (espn_id, series_espn_id, date, name) values ('99', '8050-2025-26', now(), 'a v b')`);
  const m = (await db.pool.query(`select m.espn_id from cricket_series_matches m where ${featured.featuredMatchSql("m")} order by 1`)).rows.map((r) => r.espn_id);
  // BBL and WBBL by their league; the women's T20I by its international class; the Ranji Trophy row is neither.
  assert.deepEqual(m, ["1493253", "1494557", "1513739"]);
  const s = (await db.pool.query(`select s.espn_id from cricket_series s where ${featured.featuredSeriesSql("s")} order by 1`)).rows.map((r) => r.espn_id);
  assert.ok(s.includes("8044-2025-26") && s.includes("21284-2025-26") && !s.includes("8050-2025-26"), s.join());
});

test("the Task 8 readers ask ESPN for the league, never the edition key", async () => {
  // A T20I inside a tournament edition: the reconcile and the top-up build cricket/<series id> paths.
  await db.pool.query(
    `insert into cricket_series_matches (espn_id, series_espn_id, date, name, international_class_id, status_state, status_summary)
     values ('555', '24500-2025-26', now() - interval '3 days', 'A v B', '3', 'post', 'A won')`
  );
  const missing = await importer.findMissingInternationals(10);
  assert.deepEqual(missing.matches.map((m) => m.seriesId), ["24500"]);

  await db.pool.query(
    `insert into games (league, espn_id, date, name, season_year, home_team_espn_id, away_team_espn_id, completed) values ('wpl', '555', now() - interval '3 days', 'A v B', 2026, '1', '2', true)`
  );
  const { games } = await topup.findTopUpCandidates(10, ["wpl"]);
  assert.equal(games[0].series_id, "24500");
});

test("the old league-id address resolves to the latest edition", async () => {
  await run(["20241231", "20251230", "20260105", "20251201"]);
  assert.equal(await series.getLatestCricketEdition("8044"), "8044-2025-26");
  assert.equal(await series.getLatestCricketEdition("21284"), "21284-2025-26");
  assert.equal(await series.getLatestCricketEdition("24046"), null); // a bilateral id is not an edition family
  assert.equal(await series.getLatestCricketEdition("8044-2025-26"), null); // only a bare id redirects
  assert.equal(await series.getLatestCricketEdition("99999"), null);
});

const params = (id: string) => ({ params: Promise.resolve({ id }) });
const redirectTarget = (err: unknown) => String((err as { digest?: string }).digest).split(";")[2];
async function visit(id: string) {
  try {
    await page.default(params(id));
    return { status: "renders" as const };
  } catch (err) {
    const o = await outcome(() => Promise.reject(err));
    if (o === "redirect") return { status: "redirect" as const, to: redirectTarget(err) };
    if (o === "not-found") return { status: "not-found" as const };
    throw err;
  }
}

test("/cricket/series/<league id> redirects to the latest edition; an edition and a bilateral series render; an unknown id is a 404", async () => {
  globalThis.fetch = (async () => new Response("{}", { status: 500 })) as typeof fetch; // the live overlay finds nothing
  await run(["20241231", "20251230", "20260105", "20251201"]);
  assert.deepEqual(await visit("8044"), { status: "redirect", to: "/cricket/series/8044-2025-26" });
  assert.deepEqual(await visit("8044-2024-25"), { status: "renders" });
  assert.deepEqual(await visit("8044-2025-26"), { status: "renders" });
  assert.deepEqual(await visit("24046"), { status: "renders" });
  assert.deepEqual(await visit("99999"), { status: "not-found" });
  assert.deepEqual(await visit("8044-1999-00"), { status: "not-found" });
});

test("before the re-run an old merged league-id series still renders", async () => {
  globalThis.fetch = (async () => new Response("{}", { status: 500 })) as typeof fetch;
  await db.pool.query(`insert into cricket_series (espn_id, name, is_tournament, kind, match_count) values ('8044', 'Big Bash League', true, 'domestic', 5)`);
  assert.deepEqual(await visit("8044"), { status: "renders" });
});

/* ------------- the window between deploy and the owner's re-run, and after it ------------- */

async function seedLegacy(days: string[]) {
  await db.pool.query(`insert into cricket_series (espn_id, name, is_tournament, kind, match_count, start_date, end_date) values ('8044', 'Big Bash League', true, 'domestic', 99, '2020-01-01', '2030-01-01')`);
  for (const day of days)
    for (const e of events(day, "8044")) await db.pool.query(`insert into cricket_series_matches (espn_id, series_espn_id, date, name) values ($1, '8044', $2, $3)`, [e.id, e.date, e.name]);
}

test("while the old merged row still holds matches its address renders, even once an edition row exists; emptied, it redirects", async () => {
  globalThis.fetch = (async () => new Response("{}", { status: 500 })) as typeof fetch;
  await seedLegacy(["20241231", "20250101", "20251230", "20260105"]);
  await run(["20260105"]); // the nightly job reaches only the recent day: one match leaves the old row for an edition row
  assert.equal((await db.pool.query(`select count(*)::int as n from cricket_series where espn_id = '8044-2025-26'`)).rows[0].n, 1);
  assert.ok((await db.pool.query(`select count(*)::int as n from cricket_series_matches where series_espn_id = '8044'`)).rows[0].n > 0);
  assert.equal(await series.getLatestCricketEdition("8044"), null);
  assert.deepEqual(await visit("8044"), { status: "renders" });
  // once nothing is filed under it, the bare id goes to the newest edition
  await db.pool.query(`delete from cricket_series_matches where series_espn_id = '8044'`);
  assert.equal(await series.getLatestCricketEdition("8044"), "8044-2025-26");
  assert.deepEqual(await visit("8044"), { status: "redirect", to: "/cricket/series/8044-2025-26" });
});

test("moving matches out of the old merged row recomputes it, and the ingest that empties it deletes it: no owner cleanup needed", async () => {
  globalThis.fetch = (async () => new Response("{}", { status: 500 })) as typeof fetch;
  await seedLegacy(["20241231", "20250101", "20251230", "20260105"]);
  const total = (await db.pool.query(`select count(*)::int as n from cricket_series_matches`)).rows[0].n;

  await run(["20260105"]);
  const legacy = await seriesRow("8044");
  const edition = await seriesRow("8044-2025-26");
  assert.equal(edition.match_count, 1);
  // what remains under the old row, counted and dated from its own matches (not the seeded 99 / 2020-2030)
  assert.equal(legacy.match_count, total - 1);
  const newest = (await db.pool.query(`select max(date) as d from cricket_series_matches where series_espn_id = '8044'`)).rows[0].d;
  assert.equal(utc(legacy.end_date), utc(newest));
  assert.ok(legacy.end_date < edition.start_date, "the old row no longer reaches into the edition it gave up");

  await run(["20251230", "20241231", "20250101"]);
  assert.equal(await seriesRow("8044"), undefined, "emptied legacy row is gone");
  const listed = new Set<string>();
  for (const y of [2024, 2025, 2026]) for (const r of await series.getCricketSeriesBySeason(y)) listed.add(r.espn_id);
  assert.deepEqual([...listed].filter((id) => id.startsWith("8044")).sort(), ["8044-2024-25", "8044-2025-26"]);
  assert.deepEqual(await visit("8044"), { status: "redirect", to: "/cricket/series/8044-2025-26" });
  // the optional cleanup has nothing left to do
  assert.deepEqual((await db.pool.query(ingest.LEGACY_MERGED_SERIES_DELETE_SQL)).rows, []);
});

test("an ingest recomputes every edition row of the leagues it touches, and deletes one that has been emptied", async () => {
  await run(["20251230", "20260105"]); // both days under 8044-2025-26
  const n0 = events("20241231", "8044").length;
  const n1 = events("20251230", "8044").length;
  const n2 = events("20260105", "8044").length;
  // a later listing files the 2026-01-05 matches under another edition label (a note appeared or changed): both rows are now stale
  await db.pool.query(`update cricket_series_matches set series_espn_id = '8044-2026' where espn_id = any($1::text[])`, [events("20260105", "8044").map((e) => String(e.id))]);
  await db.pool.query(`insert into cricket_series (espn_id, name, is_tournament, kind, match_count) values ('8044-2026', 'Big Bash League 2026', true, 'domestic', 0)`);
  await run(["20241231"]); // touches league 8044, but neither of those two rows
  const counts = async () => (await db.pool.query(`select espn_id, match_count from cricket_series where espn_id like '8044-%' order by espn_id`)).rows.map((r) => [r.espn_id, r.match_count]);
  assert.deepEqual(await counts(), [["8044-2024-25", n0], ["8044-2025-26", n1], ["8044-2026", n2]]);
  // a row emptied for good goes with the next ingest of its league
  await db.pool.query(`delete from cricket_series_matches where series_espn_id = '8044-2026'`);
  await run(["20241231"]);
  assert.deepEqual(await counts(), [["8044-2024-25", n0], ["8044-2025-26", n1]]);
  // a bilateral series with nothing listed yet is not a tournament row and stays
  await db.pool.query(`insert into cricket_series (espn_id, name, is_tournament, kind, match_count) values ('777', 'A tour', false, 'international', 0)`);
  await run(["20241231"]);
  assert.ok(await seriesRow("777"));
});

test("a tournament row with no stored match is never listed, searched or offered in the picker", async () => {
  await run(["20251230"]);
  await db.pool.query(`insert into cricket_series (espn_id, name, is_tournament, kind, match_count, start_date, end_date, season) values ('8044', 'Big Bash League', true, 'domestic', 73, now() - interval '3 days', now() + interval '3 days', 2026)`);
  await db.pool.query(`insert into cricket_series (espn_id, name, is_tournament, kind, match_count, start_date, end_date, season) values ('555', 'A quiet tour', false, 'international', 0, now() - interval '3 days', now() + interval '3 days', 2026)`);
  const win = (await series.getCricketSeriesWindow(30, 30)).map((r) => r.espn_id);
  assert.ok(!win.includes("8044"), "window");
  assert.ok(win.includes("555"), "a bilateral series with no match yet is still listed");
  assert.ok(!(await series.getCricketSeriesBySeason(2026)).some((r) => r.espn_id === "8044"), "archive");
  assert.ok(!(await series.searchCricketSeries("Big Bash")).some((r) => r.espn_id === "8044"), "picker");
  const hits = (await (await import("../src/lib/queries")).search("Big Bash")).filter((r) => r.type === "series").map((r) => r.slug);
  assert.ok(!hits.includes("8044") && hits.includes("8044-2025-26"), "site search");
});

test("an event without the season note is filed under the same edition as its noted neighbours (link slug), not a look-alike", async () => {
  const noteless = structuredClone(DAYS["20251230"]);
  const bbl = noteless.sports[0].leagues.find((l: any) => String(l.id) === "8044");
  for (const e of bbl.events) e.notes = [];
  const meta: import("../scripts/lib/cricket-series-ingest").SeriesMap = new Map();
  await ingest.storeMatches(ingest.ingestDay(noteless, meta));
  await ingest.storeMatches(ingest.ingestDay(DAYS["20260105"], meta)); // has the note
  await ingest.storeSeries(meta);
  assert.deepEqual([...meta.keys()].filter((k) => k.startsWith("8044")), ["8044-2025-26"]);
  const rows = (await db.pool.query(`select espn_id, match_count from cricket_series where espn_id like '8044-%'`)).rows;
  assert.deepEqual(rows.map((r) => [r.espn_id, r.match_count]), [["8044-2025-26", 1 + events("20251230", "8044").length]]);
  // the other links the fixture holds agree with their notes
  for (const [day, id, expected] of [["20241231", "8044", "8044-2024-25"], ["20240515", "8048", "8048-2024"], ["20251201", "21284", "21284-2025-26"], ["20260215", "8604", "8604-2025-26"]] as const) {
    const lg = league(day, id);
    assert.equal(key.seriesEdition(lg, { ...lg.events[0], notes: [] }).id, expected, `${id} on ${day}`);
  }
  // with neither note nor an edition in the link there is nothing to read: the numeric season, then the date's year
  assert.equal(key.seriesEdition({ id: "8044", isTournament: true }, { season: 2025, link: "https://www.espn.in/cricket/series/8044/scorecard/1/a-vs-b-3rd-match-8044", date: "2026-01-05T08:00:00Z" }).id, "8044-2025");
});

test("a series lists its other editions newest first", async () => {
  await run(["20241231", "20250101", "20251230", "20260105"]);
  const editions = await series.getCricketSeriesEditions("8044-2024-25");
  assert.deepEqual(editions.map((e) => [e.espn_id, e.label]), [["8044-2025-26", "2025-26"], ["8044-2024-25", "2024-25"]]);
  assert.deepEqual(await series.getCricketSeriesEditions("24046"), []);
});

test("the sitemap lists each edition once, no emptied league-id row that redirects, and every address resolves", async () => {
  globalThis.fetch = (async () => new Response("{}", { status: 500 })) as typeof fetch;
  await run(["20241231", "20250101", "20251230", "20260105", "20251201"]);
  // The old merged rows still in the table until the owner cleanup runs.
  await db.pool.query(`insert into cricket_series (espn_id, name, is_tournament, kind, match_count, start_date, end_date) values ('8044', 'Big Bash League', true, 'domestic', 5, '2024-12-31', '2026-01-05')`);
  await db.pool.query(`insert into cricket_series_matches (espn_id, series_espn_id, date, name) values ('1', '8044', '2024-12-31', 'legacy row')`);
  await db.pool.query(`insert into cricket_series (espn_id, name, is_tournament, kind, match_count, start_date, end_date) values ('8050', 'Ranji Trophy', true, 'domestic', 1, '2024-12-31', '2024-12-31')`);
  await db.pool.query(`insert into cricket_series_matches (espn_id, series_espn_id, date, name) values ('2', '8050', '2024-12-31', 'a v b')`);

  const urls = (await sitemap.sitemapEntries("core")).map((e) => e.url).filter((u) => u.includes("/cricket/series/"));
  assert.equal(new Set(urls).size, urls.length, "no duplicates");
  const ids = urls.map((u) => u.split("/cricket/series/")[1]);
  // The old merged 8044 row still holds a match, so its address renders (it redirects only once emptied) and is listed.
  assert.deepEqual([...ids].sort(), ["21284-2025-26", "24046", "8044", "8044-2024-25", "8044-2025-26", "8050"]);
  for (const id of ids) assert.equal((await visit(id)).status, "renders", `${id} answers 200`);
});

test("a live match is filed under its edition, so the edition page's live overlay keeps it and a bare league id's does not", async () => {
  const day = structuredClone(DAYS["20251230"]);
  const bbl = day.sports[0].leagues.find((l: any) => String(l.id) === "8044");
  Object.assign(bbl.events[0], { status: "in", fullStatus: { longSummary: "Scorchers 120/2 (12.0 ov)", type: { state: "in" } } });
  globalThis.fetch = (async () => new Response(JSON.stringify(day), { status: 200 })) as typeof fetch;
  const live = await import("../src/lib/cricketLive");
  const [m] = (await live.fetchLiveCricketFromEspn()).filter((x) => x.espn_id === "1493253");
  assert.equal(m.series_espn_id, "8044-2025-26");
  assert.equal(m.series_name, "Big Bash League 2025-26");
  assert.equal(m.scorecard_league, "bbl");
  assert.deepEqual((await live.overlayLiveCricket([], "8044-2025-26")).map((x) => x.espn_id), ["1493253"]);
  assert.deepEqual(await live.overlayLiveCricket([], "8044"), []);
});
