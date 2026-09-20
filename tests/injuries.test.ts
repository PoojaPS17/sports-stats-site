import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { startTestDb, type TestDb } from "./helpers/testDb";

let db: TestDb;
let lib: typeof import("../scripts/lib/injuries");
before(async () => {
  db = await startTestDb();
  lib = await import("../scripts/lib/injuries");
});
after(async () => {
  await db?.stop();
});
beforeEach(async () => {
  await db.pool.query("delete from injuries");
});

function feed(prefix: string, n: number) {
  return {
    injuries: [
      {
        id: "t1",
        injuries: Array.from({ length: n }, (_, i) => ({
          athlete: { id: `${prefix}${i}`, displayName: `${prefix} Player ${i}` },
          status: "Out",
          shortComment: "x",
          longComment: "y",
          date: "2026-09-20T00:00:00Z",
        })),
      },
    ],
  };
}

const count = async () => Number((await db.pool.query("select count(*) from injuries where league = 'nba'")).rows[0].count);

test("replaces a league's rows with the new feed", async () => {
  await lib.replaceLeagueInjuries(db.pool, "nba", feed("old", 5));
  const res = await lib.replaceLeagueInjuries(db.pool, "nba", feed("new", 3));
  assert.deepEqual(res, { teams: 1, count: 3 });
  const names = (await db.pool.query("select player_name from injuries where league = 'nba' order by 1")).rows.map((r) => r.player_name);
  assert.deepEqual(names, ["new Player 0", "new Player 1", "new Player 2"]);
});

test("a reader never sees an empty or partial list while it replaces", async () => {
  await lib.replaceLeagueInjuries(db.pool, "nba", feed("old", 200));
  const seen = new Set<number>();
  let running = true;
  const reader = (async () => {
    while (running) {
      seen.add(await count());
    }
  })();
  for (let i = 0; i < 5; i++) await lib.replaceLeagueInjuries(db.pool, "nba", feed(`n${i}`, 200));
  running = false;
  await reader;
  assert.deepEqual([...seen], [200]);
});

test("a malformed feed keeps the stored rows", async () => {
  await lib.replaceLeagueInjuries(db.pool, "nba", feed("old", 4));
  await assert.rejects(() => lib.replaceLeagueInjuries(db.pool, "nba", { nope: true }), /malformed/);
  assert.equal(await count(), 4);
});

test("a genuinely empty injuries list clears the league (mirrors ESPN)", async () => {
  await lib.replaceLeagueInjuries(db.pool, "nba", feed("old", 4));
  await lib.replaceLeagueInjuries(db.pool, "nba", { injuries: [] });
  assert.equal(await count(), 0);
});

test("a row the database rejects rolls the whole replace back", async () => {
  await lib.replaceLeagueInjuries(db.pool, "nba", feed("old", 4));
  const bad = feed("bad", 3);
  const row = bad.injuries[0].injuries[2];
  row.status = "Out";
  row.athlete = { id: "z", displayName: "Bad" };
  row.date = "not-a-timestamp";
  await assert.rejects(() => lib.replaceLeagueInjuries(db.pool, "nba", bad));
  assert.equal(await count(), 4);
});
