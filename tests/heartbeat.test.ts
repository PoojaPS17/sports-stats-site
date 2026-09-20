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
  await db.stop();
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
