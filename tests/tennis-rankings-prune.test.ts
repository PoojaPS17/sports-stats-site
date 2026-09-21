// tennis_rankings keeps the CURRENT ranking only, and the loader upserts it by (tour, player). A player who drops out
// of ESPN's top 100 (Royer 81 -> 104, Shevchenko 93 -> 109 in the week of 2026-09-21) therefore kept last week's rank
// and points and sat at #81 / #93 next to the players who really hold those ranks, while the new entrants at 99 and
// 100 were cut off the list. The loader now removes the rows of players who are no longer in the list it just stored.
// It never wipes a tour on an empty list, never touches the other tour or the players table, and only prunes after a
// run in which every ranked entry was stored.
import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { startTestDb, type TestDb } from "./helpers/testDb";
import { pruneStaleRankings } from "../scripts/lib/tennis";

let db: TestDb;

before(async () => {
  db = await startTestDb();
});

after(async () => {
  await db?.stop();
});

const put = (tour: string, id: string, rank: number, points: number | null = 1000) =>
  db.pool.query(`insert into tennis_rankings (tour, player_espn_id, rank, points) values ($1, $2, $3, $4)`, [tour, id, rank, points]);
const idsOf = async (tour: string) =>
  (await db.pool.query<{ player_espn_id: string }>(`select player_espn_id from tennis_rankings where tour = $1 order by player_espn_id`, [tour])).rows.map((r) => r.player_espn_id);

beforeEach(async () => {
  await db.pool.query(`delete from tennis_rankings`);
  await db.pool.query(`delete from players`);
});

test("stale rows of the tour are deleted, current ones kept, and the return value is the deleted count", async () => {
  await put("atp", "a1", 1);
  await put("atp", "royer", 81);
  await put("atp", "shevchenko", 93);
  await put("atp", "a99", 99);
  const deleted = await pruneStaleRankings(db.pool, "atp", ["a1", "a99"]);
  assert.equal(deleted, 2);
  assert.deepEqual(await idsOf("atp"), ["a1", "a99"]);
  // Nothing stale left: a second run deletes nothing.
  assert.equal(await pruneStaleRankings(db.pool, "atp", ["a1", "a99"]), 0);
});

test("the other tour's rows are untouched even when their ids are absent from the list, and the players rows stay", async () => {
  await put("atp", "a1", 1);
  await put("atp", "gone", 50);
  await put("wta", "w1", 1);
  await put("wta", "w2", 2);
  await put("wta", "gone", 3); // same id on the other tour: a different row
  await db.pool.query(`insert into players (league, espn_id, name, slug) values ('atp', 'gone', 'Gone Player', 'gone-player'), ('wta', 'w1', 'W One', 'w-one')`);
  const deleted = await pruneStaleRankings(db.pool, "atp", ["a1"]);
  assert.equal(deleted, 1);
  assert.deepEqual(await idsOf("atp"), ["a1"]);
  assert.deepEqual(await idsOf("wta"), ["gone", "w1", "w2"]);
  const players = await db.pool.query(`select espn_id from players order by espn_id`);
  assert.deepEqual(players.rows.map((r) => r.espn_id), ["gone", "w1"]);
});

test("an empty id list deletes nothing and returns 0", async () => {
  await put("atp", "a1", 1);
  await put("atp", "a2", 2);
  await put("wta", "w1", 1);
  assert.equal(await pruneStaleRankings(db.pool, "atp", []), 0);
  assert.equal(await pruneStaleRankings(db.pool, "wta", []), 0);
  assert.deepEqual(await idsOf("atp"), ["a1", "a2"]);
  assert.deepEqual(await idsOf("wta"), ["w1"]);
});

test("after pruning, a stale rank-81 row next to the real rank-81 row leaves no duplicate rank", async () => {
  // Last week's loader run left Royer at 81; this week's upsert stored the new holder of 81 and the entrants at 99/100.
  await put("atp", "royer", 81, 700);
  await put("atp", "shevchenko", 93, 650);
  await put("atp", "new81", 81, 690);
  await put("atp", "new93", 93, 640);
  await put("atp", "entrant99", 99, 600);
  await put("atp", "entrant100", 100, 599);
  const before = await db.pool.query<{ rank: number }>(`select rank from tennis_rankings where tour = $1 order by rank`, ["atp"]);
  assert.notEqual(new Set(before.rows.map((r) => r.rank)).size, before.rows.length, "fixture starts with duplicate ranks");

  const deleted = await pruneStaleRankings(db.pool, "atp", ["new81", "new93", "entrant99", "entrant100"]);
  assert.equal(deleted, 2);
  const ranks = (await db.pool.query<{ rank: number }>(`select rank from tennis_rankings where tour = $1 order by rank`, ["atp"])).rows.map((r) => r.rank);
  assert.deepEqual(ranks, [81, 93, 99, 100]);
  assert.equal(new Set(ranks).size, ranks.length);
});

// Source with comments removed, so a call that has been commented out (or only mentioned in a note) does not count.
const withoutComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

test("the loader prunes only when every ranked entry was stored (source-text: it is an entry-point script)", () => {
  const src = withoutComments(readFileSync("scripts/fetch-tennis-rankings.ts", "utf8"));
  assert.equal(src.match(/pruneStaleRankings\(/g)?.length, 1, "exactly one call");
  assert.match(src, /import \{[^}]*\bpruneStaleRankings\b[^}]*\} from "\.\/lib\/tennis"/);
  // The call sits directly inside the `count === ranks.length && count > 0` branch, ahead of the else that only logs.
  assert.match(src, /if \(count === ranks\.length && count > 0\) \{\s*const pruned = await pruneStaleRankings\(pool, tour, storedIds\);[\s\S]*?\} else \{[\s\S]*?pruning skipped/);
  // Only successfully upserted athletes are collected, right after the upsert's count++ and inside the try.
  assert.match(src, /count\+\+;\s*storedIds\.push\(String\(athlete\.id\)\);\s*\} catch/);
  // The guard check itself must not be fooled by a commented-out call or an unguarded call.
  assert.doesNotMatch(withoutComments("// await pruneStaleRankings(pool, tour, ids);"), /pruneStaleRankings/);
});
