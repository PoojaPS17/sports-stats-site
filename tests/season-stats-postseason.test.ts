// The season-stats loader stores ESPN's postseason line beside the regular-season one, in the same categories JSON,
// under new keys. The fetch is mocked with real ESPN output (Jimmy Butler, athlete 6430: /stats and /stats?seasontype=3,
// trimmed to the 2014-15 and 2016-17 seasons).
import { after, afterEach, before, test } from "node:test";
import assert from "node:assert/strict";
import { startTestDb, type TestDb } from "./helpers/testDb";
import { postseasonRows } from "../scripts/lib/season-row";
import { postseasonCategoriesOf } from "../scripts/lib/season-row";
import fixture from "./fixtures/espn-nba-butler-6430-stats.json";
// Real ESPN output for Bub Carrington (4845374, a Wizards player with no playoffs): ESPN ignores seasontype=3 and answers with his REGULAR season,
// reporting seasontype value 2 in its filters.
import noPlayoffs from "./fixtures/espn-nba-no-playoffs-4845374-seasontype3.json";

let db: TestDb;
let loader: typeof import("../scripts/lib/season-stats");
const realFetch = globalThis.fetch;
const calls: string[] = [];
/** What the mock answers to a `?seasontype=3` request; null means the Butler fixture. */
let postseasonAnswer: (() => Response) | null = null;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

before(async () => {
  db = await startTestDb();
  loader = await import("../scripts/lib/season-stats");
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    calls.push(url);
    if (url.includes("seasontype=3") && postseasonAnswer) return postseasonAnswer();
    return json(url.includes("seasontype=3") ? fixture.postseason : fixture.regular);
  }) as typeof fetch;
});

afterEach(() => {
  calls.length = 0;
  postseasonAnswer = null;
});

after(async () => {
  globalThis.fetch = realFetch;
  await (await import("../scripts/lib/db")).pool.end();
  await db?.stop();
});

const stored = async (season: number) => (await db.pool.query(`select categories, games_played, pts_avg from player_season_stats where league = 'nba' and player_espn_id = '6430' and season = $1`, [season])).rows[0];

test("the NBA loader fetches the regular season and the postseason and stores both in one categories JSON", async () => {
  const n = await loader.upsertPlayerSeasonStats("nba", "6430", null);
  assert.equal(n, 2);
  assert.equal(calls.length, 2);
  assert.ok(calls.some((u) => u.endsWith("/athletes/6430/stats")), "the regular-season request has no seasontype");
  assert.ok(calls.some((u) => u.endsWith("/athletes/6430/stats?seasontype=3")));
  const y2017 = await stored(2017);
  // Every regular-season key the profile reads is still there, unchanged.
  assert.deepEqual(Object.keys(y2017.categories).sort(), ["averages", "miscellaneous", "postseason_averages", "postseason_totals", "totals"]);
  assert.equal(y2017.categories.averages.values[0], "76");
  assert.equal(y2017.categories.averages.values[2], "37.0");
  assert.equal(y2017.games_played, 76);
  // ESPN's postseason line for 2016-17: 6 GP, 6 GS, 39.8 min, 22.7 ppg, and the totals 136 points.
  const po = y2017.categories.postseason_averages;
  assert.deepEqual(po.labels.slice(0, 3), ["GP", "GS", "MIN"]);
  assert.deepEqual(po.values.slice(0, 3), ["6", "6", "39.8"]);
  assert.equal(po.values[po.labels.indexOf("PTS")], "22.7");
  const pt = y2017.categories.postseason_totals;
  assert.equal(pt.values[pt.labels.indexOf("PTS")], "136");
  assert.equal(pt.values[pt.labels.indexOf("FG")], "46-108");
  const y2015 = await stored(2015);
  assert.deepEqual(y2015.categories.postseason_averages.values.slice(0, 3), ["12", "12", "42.2"]);
});

test("a re-run is idempotent", async () => {
  await loader.upsertPlayerSeasonStats("nba", "6430", null);
  const first = await stored(2017);
  await loader.upsertPlayerSeasonStats("nba", "6430", null);
  assert.deepEqual(await stored(2017), first);
});

test("a failed or unusable postseason response throws and leaves the stored row and its postseason_ keys untouched", async () => {
  await loader.upsertPlayerSeasonStats("nba", "6430", null);
  const before = await stored(2017);
  const before2015 = await stored(2015);
  assert.ok("postseason_averages" in before.categories);
  // getJson returns any parseable body, even on a non-2xx status, so an error body reaches the loader as a "response".
  const bad: [string, () => Response][] = [
    ["a JSON error body on a 500", () => json({ code: 500, message: "internal error" }, 500)],
    ["a JSON error body on a 200", () => json({ code: 500, message: "internal error" })],
    ["categories that is not an array", () => json({ filters: fixture.postseason.filters, categories: null })],
    ["no seasontype filter", () => json({ categories: fixture.postseason.categories })],
    ["an unparseable body", () => new Response("nope", { status: 500 })],
  ];
  for (const [what, answer] of bad) {
    postseasonAnswer = answer;
    await assert.rejects(() => loader.upsertPlayerSeasonStats("nba", "6430", null), Error, what);
    assert.deepEqual(await stored(2017), before, what);
    assert.deepEqual(await stored(2015), before2015, what);
  }
});

test("a real 'no playoffs that season' answer (the categories with empty statistics) stores no postseason keys and keeps the regular ones", async () => {
  postseasonAnswer = () => json({ filters: fixture.postseason.filters, categories: fixture.postseason.categories.map((c) => ({ ...c, statistics: [] })) });
  assert.equal(await loader.upsertPlayerSeasonStats("nba", "6430", null), 2);
  const row = await stored(2017);
  assert.deepEqual(Object.keys(row.categories).sort(), ["averages", "miscellaneous", "totals"]);
  assert.equal(row.categories.averages.values[0], "76");
  assert.equal(row.games_played, 76);
});

test("ESPN's fallback for a player with no postseason (his regular season under seasontype value 2) is not stored as a postseason line", async () => {
  // Real answers: the regular request and the seasontype=3 request both carry the regular rows for a player with no playoffs.
  postseasonAnswer = () => json(noPlayoffs);
  const n = await loader.upsertPlayerSeasonStats("nba", "6430", null);
  assert.equal(n, 2);
  for (const season of [2015, 2017]) {
    const keys = Object.keys((await stored(season)).categories);
    assert.equal(keys.some((k) => k.startsWith("postseason_")), false, `${season}: ${keys.join(",")}`);
  }
  assert.deepEqual(postseasonCategoriesOf(noPlayoffs), []);
});

test("the NFL loader makes no postseason request", async () => {
  await loader.upsertPlayerSeasonStats("nfl", "6430", null);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].includes("seasontype"), false);
});

test("postseasonRows: only the averages and totals categories, only for a season the player has a row in", () => {
  const cats = fixture.postseason.categories;
  assert.deepEqual(Object.keys(postseasonRows(cats, 2017)).sort(), ["postseason_averages", "postseason_totals"]);
  assert.deepEqual(postseasonRows(cats, 2016), {});
  assert.deepEqual(postseasonRows([], 2017), {});
});

test("postseasonCategoriesOf: the postseason categories for seasontype 3, nothing for the fallback, an error for a non-answer", () => {
  assert.equal(postseasonCategoriesOf(fixture.postseason), fixture.postseason.categories);
  assert.deepEqual(postseasonCategoriesOf(noPlayoffs), []);
  assert.throws(() => postseasonCategoriesOf({ code: 500, message: "x" }), /no categories array/);
  assert.throws(() => postseasonCategoriesOf(null), /no categories array/);
  assert.throws(() => postseasonCategoriesOf({ categories: [] }), /no seasontype filter/);
  assert.deepEqual(postseasonCategoriesOf({ filters: [{ name: "seasontype", value: 3 }], categories: [] }), []);
});
