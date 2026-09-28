import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { startTestDb, type TestDb } from "./helpers/testDb";

let db: TestDb;
before(async () => {
  db = await startTestDb();
});
after(async () => {
  await db?.stop();
});

test("buildSection reports the commit and build time the config exposed", async () => {
  const { buildSection } = await import("../src/lib/opsReport");
  process.env.NEXT_PUBLIC_BUILD_COMMIT = "abc1234";
  process.env.NEXT_PUBLIC_BUILD_TIME = "2026-09-28T10:00:00.000Z";
  const s = buildSection();
  assert.ok(s.ok);
  assert.deepEqual(s.data, { commit: "abc1234", builtAt: "2026-09-28T10:00:00.000Z" });
});

test("heartbeatsSection flags a scraper past its limit and one that never ran", async () => {
  const { heartbeatsSection } = await import("../src/lib/opsReport");
  await db.pool.query(`insert into scrape_runs (scraper, last_ok_at) values
    ('scrape-tick', now() - interval '10 minutes'),
    ('fetch-injuries', now() - interval '5 hours')`);
  const s = await heartbeatsSection(db.pool);
  assert.ok(s.ok);
  const byName = Object.fromEntries(s.data.map((h) => [h.scraper, h]));
  assert.equal(byName["scrape-tick"].stale, false);
  assert.equal(byName["fetch-injuries"].stale, true);
  assert.equal(byName["fetch-injuries"].limitMinutes, 120);
  assert.equal(byName["fetch-f1-scores"].ageMinutes, null, "a limit with no row reports null age");
  assert.equal(byName["fetch-f1-scores"].stale, true);
});

test("opsReport never throws for one broken section", async () => {
  const { opsReport } = await import("../src/lib/opsReport");
  const report = await opsReport(db.pool);
  assert.equal(report.build.ok, true);
  assert.equal(report.heartbeats.ok, true);
  assert.equal(typeof report.generatedAt, "string");
});
