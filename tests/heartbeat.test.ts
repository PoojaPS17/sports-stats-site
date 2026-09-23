import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { startTestDb, type TestDb } from "./helpers/testDb";

let db: TestDb;
let hb: typeof import("../scripts/lib/heartbeat");
before(async () => {
  db = await startTestDb();
  hb = await import("../scripts/lib/heartbeat");
});
after(async () => {
  await db?.stop();
});
beforeEach(async () => {
  await db.pool.query("delete from scrape_runs");
});

const LIMITS = { "job-a": 180, "job-b": 60 };

test("a scraper that never ran is stale with a null age", async () => {
  assert.deepEqual(await hb.findStale(db.pool, LIMITS), [
    { scraper: "job-a", ageMinutes: null },
    { scraper: "job-b", ageMinutes: null },
  ]);
});

test("fresh runs are not stale", async () => {
  await hb.recordRun(db.pool, "job-a");
  await hb.recordRun(db.pool, "job-b");
  assert.deepEqual(await hb.findStale(db.pool, LIMITS), []);
});

test("a run older than its limit is stale", async () => {
  await hb.recordRun(db.pool, "job-a");
  await hb.recordRun(db.pool, "job-b");
  await db.pool.query(`update scrape_runs set last_ok_at = now() - interval '4 hours' where scraper = 'job-a'`);
  const stale = await hb.findStale(db.pool, LIMITS);
  assert.equal(stale.length, 1);
  assert.equal(stale[0].scraper, "job-a");
  assert.ok((stale[0].ageMinutes ?? 0) >= 239);
});

test("a fresh run clears a stale scraper (last_ok_at refreshes on every run)", async () => {
  await hb.recordRun(db.pool, "job-a");
  await db.pool.query(`update scrape_runs set last_ok_at = now() - interval '4 hours' where scraper = 'job-a'`);
  assert.equal((await hb.findStale(db.pool, { "job-a": 180 })).length, 1);
  await hb.recordRun(db.pool, "job-a");
  assert.deepEqual(await hb.findStale(db.pool, { "job-a": 180 }), []);
});

test("last_changed_at moves only when changed is true", async () => {
  await hb.recordRun(db.pool, "job-a");
  let row = (await db.pool.query("select last_changed_at from scrape_runs where scraper = 'job-a'")).rows[0];
  assert.equal(row.last_changed_at, null);
  await hb.recordRun(db.pool, "job-a", { changed: true });
  row = (await db.pool.query("select last_changed_at from scrape_runs where scraper = 'job-a'")).rows[0];
  assert.ok(row.last_changed_at instanceof Date);
  const first = row.last_changed_at as Date;
  await hb.recordRun(db.pool, "job-a", { changed: false });
  row = (await db.pool.query("select last_changed_at from scrape_runs where scraper = 'job-a'")).rows[0];
  assert.equal((row.last_changed_at as Date).getTime(), first.getTime());
});

test("the default limits cover the tick and the hourly feeds; a missing row is stale with a null age", async () => {
  assert.deepEqual(
    (await hb.findStale(db.pool)).map((s) => s.scraper).sort(),
    ["fetch-asian-games-medals", "fetch-f1-scores", "fetch-f1-standings", "fetch-injuries", "scrape-tick"]
  );
  assert.deepEqual((await hb.findStale(db.pool)).find((s) => s.scraper === "scrape-tick"), { scraper: "scrape-tick", ageMinutes: null });
  assert.equal(hb.MAX_AGE_MINUTES["scrape-tick"], 150);
  assert.equal(hb.MAX_AGE_MINUTES["fetch-injuries"], 120);
});

test("default limits: a 4h-old fetch-injuries run is stale, a 90-minute-old one is not", async () => {
  for (const name of Object.keys(hb.MAX_AGE_MINUTES)) await hb.recordRun(db.pool, name);
  assert.deepEqual(await hb.findStale(db.pool), []);
  await db.pool.query(`update scrape_runs set last_ok_at = now() - interval '90 minutes' where scraper = 'fetch-injuries'`);
  assert.deepEqual(await hb.findStale(db.pool), []);
  await db.pool.query(`update scrape_runs set last_ok_at = now() - interval '4 hours' where scraper = 'fetch-injuries'`);
  const stale = await hb.findStale(db.pool);
  assert.equal(stale.length, 1);
  assert.equal(stale[0].scraper, "fetch-injuries");
  assert.ok((stale[0].ageMinutes ?? 0) >= 239);
});
