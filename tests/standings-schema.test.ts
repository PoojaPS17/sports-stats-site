import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { startTestDb, type TestDb } from "./helpers/testDb";

// `npm run migrate` applies db/schema.sql to a database that may be brand new, may be the production one
// (`standings` created with a (league, season, team_espn_id) primary key), or may already carry a hand-made index.
// scripts/lib/standings.ts upserts `on conflict (league, season, team_espn_id, coalesce(conference, ''))`, which needs a
// valid, non-partial unique index on exactly those keys. Whatever state the database starts in, the migration must
// leave one such index (its own `standings_stage_key`, or an equivalent one that was already there) and no old primary
// key, and that statement must run. Every state is migrated twice.
let db: TestDb;
const schema = readFileSync(resolve(process.cwd(), "db/schema.sql"), "utf8");
// The statement that creates `standings` in its original form (primary key, no later columns).
const createStandings = /create table if not exists standings \([\s\S]*?\n\);/.exec(schema)![0];

before(async () => {
  db = await startTestDb();
});
after(async () => {
  await db?.stop();
});

// The exact catalog test the migration uses for "an equivalent index exists": unique, valid, immediate, no
// predicate, four key columns, and the keys league, season, team_espn_id, COALESCE(conference, ''::text).
const EQUIVALENT = `
  select c.relname as name
  from pg_index i join pg_class c on c.oid = i.indexrelid
  where i.indrelid = 'standings'::regclass
    and i.indisunique and i.indisvalid and i.indimmediate and i.indpred is null and i.indnkeyatts = 4
    and (select array_agg(pg_get_indexdef(i.indexrelid, k, true) order by k) from generate_series(1, 4) k)
        = array['league', 'season', 'team_espn_id', 'COALESCE(conference, ''''::text)']
  order by 1`;
const names = async (sql: string) => (await db.pool.query(sql)).rows.map((r) => r.name as string);
const equivalent = () => names(EQUIVALENT);
const uniqueIndexes = () => names(`select c.relname as name from pg_index i join pg_class c on c.oid = i.indexrelid where i.indrelid = 'standings'::regclass and i.indisunique order by 1`);
const primaryKeys = () => names(`select conname as name from pg_constraint where conrelid = 'standings'::regclass and contype = 'p'`);
const columns = () => names(`select column_name as name from information_schema.columns where table_name = 'standings' and column_name in ('rank', 'zone') order by 1`);

// The upsert from scripts/lib/standings.ts (conflict target and all), run twice so its conflict branch is used.
async function upsertWorks() {
  const sql = `insert into standings (league, season, team_espn_id, conference, wins, losses) values ('epl', 2025, '1', null, $1, 0)
               on conflict (league, season, team_espn_id, coalesce(conference, '')) do update set wins = excluded.wins`;
  await db.pool.query(sql, [1]);
  await db.pool.query(sql, [2]);
  assert.equal((await db.pool.query(`select wins from standings where team_espn_id = '1'`)).rows[0].wins, 2);
}

// A blank slate in the old shape: `standings` as first created (primary key), plus whatever the case sets up.
async function startFrom(setup: string[] = []) {
  await db.pool.query(`drop table if exists standings`);
  await db.pool.query(createStandings);
  for (const sql of setup) await db.pool.query(sql);
}
const migrateTwice = async () => {
  await db.pool.query(schema);
  await db.pool.query(schema);
};
// After a successful migration of any state: no old key, the columns exist, exactly one equivalent index, and the upsert runs.
async function assertMigrated(expectedEquivalent: string[]) {
  assert.deepEqual(await primaryKeys(), []);
  assert.deepEqual(await columns(), ["rank", "zone"]);
  assert.deepEqual(await equivalent(), expectedEquivalent);
  await upsertWorks();
}

test("a new database has exactly one equivalent unique index, no old primary key, and the upsert runs", async () => {
  assert.deepEqual(await uniqueIndexes(), ["standings_stage_key"]);
  await assertMigrated(["standings_stage_key"]);
  await migrateTwice();
  assert.deepEqual(await uniqueIndexes(), ["standings_stage_key"]);
});

test("the old primary key alone: migrated to the conference-aware key, rows kept, a second stage row allowed, a duplicate stage refused", async () => {
  await startFrom([`insert into standings (league, season, team_espn_id, conference, wins, losses) values ('epl', 2025, '9', 'g', 5, 3)`]);
  assert.deepEqual(await primaryKeys(), ["standings_pkey"]);
  await migrateTwice();
  await assertMigrated(["standings_stage_key"]);
  assert.deepEqual(await uniqueIndexes(), ["standings_stage_key"]);
  assert.equal((await db.pool.query(`select 1 from standings where team_espn_id = '9'`)).rowCount, 1);
  await db.pool.query(`insert into standings (league, season, team_espn_id, conference, wins, losses) values ('epl', 2025, '9', 'Super Eights', 1, 0)`);
  await assert.rejects(db.pool.query(`insert into standings (league, season, team_espn_id, conference, wins, losses) values ('epl', 2025, '9', 'g', 5, 3)`), /duplicate key/);
});

const HAND_MADE = `create unique index standings_hand_made on standings (league, season, team_espn_id, (coalesce(conference, '')))`;

test("a hand-made equivalent index under another name is kept as the only one", async () => {
  await startFrom([`alter table standings drop constraint standings_pkey`, HAND_MADE]);
  await migrateTwice();
  await assertMigrated(["standings_hand_made"]);
  assert.deepEqual(await uniqueIndexes(), ["standings_hand_made"]);
});

test("the old primary key still present AND a hand-made equivalent index: the key is dropped and no duplicate index is created", async () => {
  await startFrom([HAND_MADE]);
  assert.deepEqual(await primaryKeys(), ["standings_pkey"]);
  await migrateTwice();
  await assertMigrated(["standings_hand_made"]);
  assert.deepEqual(await uniqueIndexes(), ["standings_hand_made"]);
});

// Indexes that look alike but the upsert cannot use: the migration must not count them, and creates its own.
const LOOK_ALIKES: [string, string[], string][] = [
  ["a partial unique index on the same keys", [`create unique index standings_partial on standings (league, season, team_espn_id, (coalesce(conference, ''))) where season > 2000`], "standings_partial"],
  ["an extra trailing key column", [`create unique index standings_extra on standings (league, season, team_espn_id, (coalesce(conference, '')), wins)`], "standings_extra"],
  ["a different coalesce default", [`create unique index standings_x on standings (league, season, team_espn_id, (coalesce(conference, 'x')))`], "standings_x"],
  ["a look-alike column (conference_code)", [`alter table standings add column conference_code text`, `create unique index standings_code on standings (league, season, team_espn_id, (coalesce(conference_code, '')))`], "standings_code"],
  ["the plain conference column with no coalesce", [`create unique index standings_plain on standings (league, season, team_espn_id, conference)`], "standings_plain"],
  ["the right keys in a non-unique index", [`create index standings_nonunique on standings (league, season, team_espn_id, (coalesce(conference, '')))`], "standings_nonunique"],
];
for (const [label, setup, kept] of LOOK_ALIKES) {
  test(`${label} is not accepted as the conflict index: standings_stage_key is created next to it and the upsert runs`, async () => {
    await startFrom([`alter table standings drop constraint standings_pkey`, ...setup]);
    await migrateTwice();
    await assertMigrated(["standings_stage_key"]);
    assert.ok((await names(`select c.relname as name from pg_index i join pg_class c on c.oid = i.indexrelid where i.indrelid = 'standings'::regclass`)).includes(kept), `${kept} is untouched`);
  });
}

test("an invalid equivalent index (indisvalid = false) is not accepted; standings_stage_key is created", async () => {
  // A failed CREATE INDEX CONCURRENTLY leaves exactly this; the scratch database lets us flip the flag in the catalog directly.
  await startFrom([`alter table standings drop constraint standings_pkey`, HAND_MADE, `update pg_index set indisvalid = false where indexrelid = 'standings_hand_made'::regclass`]);
  assert.deepEqual(await equivalent(), [], "the catalog test itself rejects it");
  await migrateTwice();
  await assertMigrated(["standings_stage_key"]);
});

test("a relation named standings_stage_key that is not the right index stops the migration with a clear error and changes nothing", async () => {
  for (const setup of [
    `create unique index standings_stage_key on standings (league, season, team_espn_id, (coalesce(conference, ''))) where season > 2000`,
    `create unique index standings_stage_key on standings (league, season, team_espn_id, conference)`,
    `create table standings_stage_key (id int)`,
  ]) {
    await startFrom([setup]);
    await assert.rejects(db.pool.query(schema), /standings_stage_key exists but is not a valid, non-partial unique index/);
    // the whole file ran in one transaction: even the primary-key drop was rolled back
    assert.deepEqual(await primaryKeys(), ["standings_pkey"]);
    assert.deepEqual(await columns(), [], "no column from the file was kept either");
    await db.pool.query(setup.startsWith("create table") ? `drop table standings_stage_key` : `drop index standings_stage_key`);
    await migrateTwice();
    await assertMigrated(["standings_stage_key"]);
  }
});

test("an invalid standings_stage_key itself also stops the migration (drop it and run again)", async () => {
  await startFrom([`alter table standings drop constraint standings_pkey`, `create unique index standings_stage_key on standings (league, season, team_espn_id, (coalesce(conference, '')))`, `update pg_index set indisvalid = false where indexrelid = 'standings_stage_key'::regclass`]);
  await assert.rejects(db.pool.query(schema), /standings_stage_key exists but is not a valid/);
  await db.pool.query(`drop index standings_stage_key`);
  await migrateTwice();
  await assertMigrated(["standings_stage_key"]);
});
