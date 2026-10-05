import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { applySchema, DEADLOCK_DETECTED, schemaHash } from "../scripts/lib/applySchema";
import { startTestDb, type TestDb } from "./helpers/testDb";

let db: TestDb;
before(async () => {
  db = await startTestDb();
});
after(async () => {
  await db?.stop();
});

test("applies a schema once and reports later runs of the same file as unchanged", async () => {
  const sql = "create table if not exists migrate_probe_a (id int primary key);";
  const first = await applySchema(db.pool, sql);
  assert.equal(first.outcome, "applied");
  assert.equal(first.hash, schemaHash(sql));
  const { rows } = await db.pool.query("select to_regclass('migrate_probe_a') as t");
  assert.equal(rows[0].t, "migrate_probe_a");

  const second = await applySchema(db.pool, sql);
  assert.equal(second.outcome, "unchanged");
  assert.equal(second.hash, first.hash);
});

test("a changed schema file is applied and becomes the recorded one", async () => {
  const sqlA = "create table if not exists migrate_probe_b (id int primary key);";
  await applySchema(db.pool, sqlA);
  const sqlB = `${sqlA}\ncreate table if not exists migrate_probe_c (id int primary key);`;
  const changed = await applySchema(db.pool, sqlB);
  assert.equal(changed.outcome, "applied");
  const { rows } = await db.pool.query("select to_regclass('migrate_probe_c') as t");
  assert.equal(rows[0].t, "migrate_probe_c");
  assert.equal((await applySchema(db.pool, sqlB)).outcome, "unchanged");
  // The older file is no longer the recorded one, so it would be applied again, not skipped.
  assert.equal((await applySchema(db.pool, sqlA)).outcome, "applied");
});

// A fake client that answers the bookkeeping queries and fails the schema statement a set number
// of times with the given SQLSTATE.
function fakeDb(sql: string, failures: number, code: string) {
  const calls: string[] = [];
  let left = failures;
  return {
    calls,
    query: async (text: string) => {
      calls.push(text);
      if (text === sql && left > 0) {
        left -= 1;
        throw Object.assign(new Error(`fake ${code}`), { code });
      }
      return { rows: [] };
    },
  };
}

test("a deadlock aborting the schema statement is retried after a pause", async () => {
  const sql = "create table if not exists migrate_probe_d (id int);";
  const fake = fakeDb(sql, 2, DEADLOCK_DETECTED);
  const sleeps: number[] = [];
  const result = await applySchema(fake, sql, { sleep: async (ms) => void sleeps.push(ms) });
  assert.equal(result.outcome, "applied");
  assert.equal(result.attempts, 3);
  assert.equal(fake.calls.filter((c) => c === sql).length, 3);
  assert.deepEqual(sleeps, [5000, 5000]);
});

test("a deadlock on every attempt gives up after the retry budget", async () => {
  const sql = "create table if not exists migrate_probe_e (id int);";
  const fake = fakeDb(sql, 99, DEADLOCK_DETECTED);
  await assert.rejects(applySchema(fake, sql, { sleep: async () => {} }), /fake 40P01/);
  assert.equal(fake.calls.filter((c) => c === sql).length, 3);
});

test("any other database error is not retried", async () => {
  const sql = "create table if not exists migrate_probe_f (id int);";
  const fake = fakeDb(sql, 99, "42601");
  const sleeps: number[] = [];
  await assert.rejects(applySchema(fake, sql, { sleep: async (ms) => void sleeps.push(ms) }), /fake 42601/);
  assert.equal(fake.calls.filter((c) => c === sql).length, 1);
  assert.deepEqual(sleeps, []);
});
