import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { startTestDb, type TestDb } from "./helpers/testDb";

let db: TestDb;
let cricketSeries: typeof import("../src/lib/cricketSeries");
let queries: typeof import("../src/lib/queries");

before(async () => {
  db = await startTestDb();
  cricketSeries = await import("../src/lib/cricketSeries");
  queries = await import("../src/lib/queries");
  await db.pool.query(`insert into cricket_series (espn_id, name, kind) values ('s1', 'Test Series', 'domestic')`);
  await db.pool.query(
    `insert into cricket_series_matches (espn_id, series_espn_id, date, name, status_state) values
       ('m1', 's1', now() - interval '2 days', 'A v B', 'post'), ('m2', 's1', now() - interval '3 days', 'C v D', 'post')`
  );
  const views = [["cricket", "m1", "IN", "ios", "now()"], ["cricket", "m1", "IN", "desktop", "now()"], ["cricket", "m2", "US", "desktop", "now()"], ["cricket", "m2", "US", "desktop", "now() - interval '5 days'"], ["cricket", "m2", "US", "desktop", "now() - interval '5 days'"], ["epl", "m1", "IN", "ios", "now()"]];
  for (const [league, id, country, platform, at] of views) {
    await db.pool.query(`insert into game_views (league, game_espn_id, country, platform, viewed_at) values ($1, $2, $3, $4, ${at})`, [league, id, country, platform]);
  }
});

after(async () => {
  await db?.stop();
});

test("the most-viewed cricket matches are ranked by views under the cricket marker, with a numeric count", async () => {
  const all = await cricketSeries.getTopCricketMatches(null);
  assert.deepEqual(all.map((m) => [m.espn_id, m.views]), [["m2", 3], ["m1", 2]], "another league's view of the same id is not counted");
  assert.equal(all[0].series_name, "Test Series");
});

test("a window and the country and device filters narrow the count", async () => {
  const today = await cricketSeries.getTopCricketMatches(queries.WINDOW_INTERVAL.today);
  assert.deepEqual(today.map((m) => [m.espn_id, m.views]), [["m1", 2], ["m2", 1]]);
  assert.deepEqual((await cricketSeries.getTopCricketMatches(null, { country: "IN" })).map((m) => m.espn_id), ["m1"]);
  assert.deepEqual((await cricketSeries.getTopCricketMatches(null, { platform: "ios" })).map((m) => [m.espn_id, m.views]), [["m1", 1]]);
});
