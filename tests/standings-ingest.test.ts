import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { startTestDb, type TestDb } from "./helpers/testDb";

let db: TestDb;
let standings: typeof import("../scripts/lib/standings");
before(async () => {
  db = await startTestDb();
  standings = await import("../scripts/lib/standings");
});
after(async () => {
  await db?.stop();
});
beforeEach(async () => {
  await db.pool.query("delete from standings");
});

const stat = (name: string, displayValue: string) => ({ name, displayValue });
function entry(teamId: string, stats: [string, string][]) {
  return { team: { id: teamId }, stats: stats.map(([n, v]) => stat(n, v)) };
}
// ESPN's standings response: a season and one group (or several) of entries.
const response = (year: number, name: string, entries: ReturnType<typeof entry>[]) => ({ season: { year }, children: [{ name, standings: { entries } }] });
const stored = async (league: string, season = 2025) =>
  (await db.pool.query(`select team_espn_id, rank, draws, points, wins, losses from standings where league = $1 and season = $2 order by team_espn_id`, [league, season])).rows;

test("ESPN's rank and ties are stored on insert", async () => {
  const data = response(2025, "2025-26 Spanish LALIGA", [
    entry("1", [["rank", "16"], ["ties", "13"], ["points", "37"], ["wins", "8"], ["losses", "17"]]),
    entry("2", [["rank", "17"], ["ties", "7"], ["points", "37"], ["wins", "10"], ["losses", "21"]]),
  ]);
  assert.equal(await standings.upsertStandingsResponse("laliga", data), 2);
  assert.deepEqual(await stored("laliga"), [
    { team_espn_id: "1", rank: 16, draws: 13, points: 37, wins: 8, losses: 17 },
    { team_espn_id: "2", rank: 17, draws: 7, points: 37, wins: 10, losses: 21 },
  ]);
});

test("a later fetch updates the stored rank and ties in place (the conflict branch)", async () => {
  await standings.upsertStandingsResponse("laliga", response(2025, "g", [entry("1", [["rank", "16"], ["ties", "13"]]), entry("2", [["rank", "17"], ["ties", "7"]])]));
  await standings.upsertStandingsResponse("laliga", response(2025, "g", [entry("1", [["rank", "17"], ["ties", "14"]]), entry("2", [["rank", "16"], ["ties", "7"]])]));
  assert.deepEqual((await stored("laliga")).map((r) => [r.team_espn_id, r.rank, r.draws]), [["1", 17, 14], ["2", 16, 7]]);
});

test("a row ESPN sends no rank for stores null, and a rank that is not a real position is not stored", async () => {
  await standings.upsertStandingsResponse("epl", response(2025, "g", [entry("1", [["wins", "5"]]), entry("2", [["rank", "0"]]), entry("3", [["rank", "-"]]), entry("4", [["rank", "1"]])]));
  assert.deepEqual((await stored("epl")).map((r) => [r.team_espn_id, r.rank]), [["1", null], ["2", null], ["3", null], ["4", 1]]);
});

test("an NFL tie is kept in draws next to win percentage", async () => {
  await standings.upsertStandingsResponse("nfl", response(2025, "NFC East", [entry("6", [["wins", "7"], ["losses", "9"], ["ties", "1"], ["winPercent", "0.441"]])]));
  const { rows } = await db.pool.query(`select wins, losses, draws, win_percent::float as pct from standings where league = 'nfl'`);
  assert.deepEqual(rows, [{ wins: 7, losses: 9, draws: 1, pct: 0.441 }]);
});
