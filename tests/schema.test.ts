import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { startTestDb, type TestDb } from "./helpers/testDb";

let db: TestDb;
before(async () => {
  db = await startTestDb();
});
after(async () => {
  await db?.stop();
});

test("schema applies and creates the core tables", async () => {
  const { rows } = await db.pool.query(
    `select table_name from information_schema.tables where table_schema = 'public' and table_name in ('games', 'injuries', 'f1_sessions')`
  );
  assert.equal(rows.length, 3);
});

test("schema is idempotent (migrate runs on every scrape)", async () => {
  await db.pool.query(readFileSync(resolve(process.cwd(), "db/schema.sql"), "utf8"));
});

// The daily job's heartbeat is new, and a scraper with no row counts as stale. Without a seed the
// health route and the GitHub watchdog would alarm from the deploy until the first daily run the
// next morning, so the schema seeds the row once; the real job overwrites it from then on.
test("schema seeds a scrape-daily heartbeat so the new limit does not alarm before the first daily run", async () => {
  const { findStale } = await import("../scripts/lib/heartbeat");
  const { rows } = await db.pool.query(`select last_ok_at from scrape_runs where scraper = 'scrape-daily'`);
  assert.equal(rows.length, 1, "seeded by schema.sql");
  assert.ok(!(await findStale(db.pool)).some((s) => s.scraper === "scrape-daily"));

  // Re-applying the schema must not touch a heartbeat the job has since recorded.
  await db.pool.query(`update scrape_runs set last_ok_at = now() - interval '3 hours' where scraper = 'scrape-daily'`);
  await db.pool.query(readFileSync(resolve(process.cwd(), "db/schema.sql"), "utf8"));
  const again = await db.pool.query(`select extract(epoch from now() - last_ok_at) as age from scrape_runs where scraper = 'scrape-daily'`);
  assert.ok(Number(again.rows[0].age) > 3 * 3600 - 60, "the seed does not reset an existing row");
});
