import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { startTestDb, type TestDb } from "./helpers/testDb";

// `npm run migrate` applies db/schema.sql to a database that may be brand new, may be the production
// one that had `standings` created with a (league, season, team_espn_id) primary key, or may already
// have a hand-made unique index on the conference-aware key that scripts/lib/standings.ts upserts on.
// Every one of those must end with exactly one such unique index and no old primary key.
let db: TestDb;
const schema = readFileSync(resolve(process.cwd(), "db/schema.sql"), "utf8");
before(async () => {
  db = await startTestDb();
});
after(async () => {
  await db?.stop();
});

const stageIndexes = async () =>
  (await db.pool.query(`select indexname from pg_indexes where schemaname = current_schema() and tablename = 'standings' and indexdef ~* 'unique index .*\\(league, season, team_espn_id, coalesce\\(conference' order by indexname`)).rows.map((r) => r.indexname as string);
const primaryKeys = async () => (await db.pool.query(`select conname from pg_constraint where conrelid = 'standings'::regclass and contype = 'p'`)).rows;
const rankColumn = async () => (await db.pool.query(`select data_type from information_schema.columns where table_name = 'standings' and column_name = 'rank'`)).rows;

test("a new database has the rank column, exactly one conference-aware unique index and no old primary key", async () => {
  assert.deepEqual(await stageIndexes(), ["standings_stage_key"]);
  assert.deepEqual(await primaryKeys(), []);
  assert.deepEqual(await rankColumn(), [{ data_type: "integer" }]);
});

test("applying the schema again changes nothing and succeeds", async () => {
  await db.pool.query(schema);
  await db.pool.query(schema);
  assert.deepEqual(await stageIndexes(), ["standings_stage_key"]);
  assert.deepEqual(await primaryKeys(), []);
});

test("a database still on the old primary key is migrated to the conference-aware key, keeping its rows", async () => {
  await db.pool.query(`delete from standings`);
  await db.pool.query(`drop index standings_stage_key`);
  await db.pool.query(`alter table standings drop column rank`);
  await db.pool.query(`alter table standings add constraint standings_pkey primary key (league, season, team_espn_id)`);
  await db.pool.query(`insert into standings (league, season, team_espn_id, conference, wins, losses) values ('epl', 2025, '1', 'g', 5, 3)`);
  assert.equal((await primaryKeys()).length, 1);

  await db.pool.query(schema);

  assert.deepEqual(await primaryKeys(), []);
  assert.deepEqual(await stageIndexes(), ["standings_stage_key"]);
  assert.deepEqual(await rankColumn(), [{ data_type: "integer" }]);
  assert.equal((await db.pool.query(`select 1 from standings where team_espn_id = '1'`)).rowCount, 1);
  // the point of the new key: one team in two stage tables of a season
  await db.pool.query(`insert into standings (league, season, team_espn_id, conference, wins, losses) values ('epl', 2025, '1', 'Super Eights', 1, 0)`);
  // and the same team and stage still cannot be stored twice
  await assert.rejects(db.pool.query(`insert into standings (league, season, team_espn_id, conference, wins, losses) values ('epl', 2025, '1', 'g', 5, 3)`), /duplicate key/);
});

test("a hand-made unique index under another name is left as the only one", async () => {
  await db.pool.query(`drop index standings_stage_key`);
  await db.pool.query(`create unique index standings_hand_made on standings (league, season, team_espn_id, (coalesce(conference, '')))`);
  await db.pool.query(schema);
  assert.deepEqual(await stageIndexes(), ["standings_hand_made"]);
  assert.deepEqual(await primaryKeys(), []);
});
