// The season-stats loader stores ESPN's postseason line beside the regular-season one, in the same categories JSON,
// under new keys. The fetch is mocked with real ESPN output (Jimmy Butler, athlete 6430: /stats and /stats?seasontype=3,
// trimmed to the 2014-15 and 2016-17 seasons).
import { after, afterEach, before, test } from "node:test";
import assert from "node:assert/strict";
import { startTestDb, type TestDb } from "./helpers/testDb";
import { postseasonRows } from "../scripts/lib/season-row";
import fixture from "./fixtures/espn-nba-butler-6430-stats.json";

let db: TestDb;
let loader: typeof import("../scripts/lib/season-stats");
const realFetch = globalThis.fetch;
const calls: string[] = [];
let failPostseason = false;

before(async () => {
  db = await startTestDb();
  loader = await import("../scripts/lib/season-stats");
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    calls.push(url);
    if (url.includes("seasontype=3") && failPostseason) return new Response("nope", { status: 500 });
    const body = url.includes("seasontype=3") ? fixture.postseason : fixture.regular;
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
});

afterEach(() => {
  calls.length = 0;
  failPostseason = false;
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

test("a re-run is idempotent, and a failed postseason request leaves the stored row untouched", async () => {
  await loader.upsertPlayerSeasonStats("nba", "6430", null);
  const before = await stored(2017);
  assert.deepEqual(Object.keys(before.categories).includes("postseason_averages"), true);
  failPostseason = true;
  await assert.rejects(() => loader.upsertPlayerSeasonStats("nba", "6430", null), /ESPN request failed/);
  assert.deepEqual(await stored(2017), before);
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
