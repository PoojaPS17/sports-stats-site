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
