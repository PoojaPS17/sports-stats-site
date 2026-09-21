import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

// ---- ESPN's qualification note, stored as `zone` ----

const zones = async (league: string, season = 2025) =>
  (await db.pool.query(`select team_espn_id, zone, rank from standings where league = $1 and season = $2 order by team_espn_id`, [league, season])).rows.map((r) => [r.team_espn_id, r.zone]);
const withNote = (teamId: string, description: string | null, stats: [string, string][] = [["rank", "1"]]) => ({ ...entry(teamId, stats), ...(description === null ? {} : { note: { color: "#81D6AC", description, rank: 1 } }) });

test("a soccer entry's note.description is stored as zone on insert, null when the entry has no note", async () => {
  const data = response(2025, "2025-26 LALIGA", [withNote("1", "Champions League"), withNote("2", null, [["rank", "8"]]), withNote("3", "Conference League qualifying", [["rank", "7"]])]);
  await standings.upsertStandingsResponse("laliga", data);
  assert.deepEqual(await zones("laliga"), [["1", "Champions League"], ["2", null], ["3", "Conference League qualifying"]]);
});

test("a later fetch updates the stored zone in place, and clears it when ESPN drops the note (the conflict branch)", async () => {
  await standings.upsertStandingsResponse("seriea", response(2025, "g", [withNote("1", "Europa League"), withNote("2", "Relegated")]));
  await standings.upsertStandingsResponse("seriea", response(2025, "g", [withNote("1", "Champions League"), withNote("2", null)]));
  assert.deepEqual(await zones("seriea"), [["1", "Champions League"], ["2", null]]);
  assert.equal((await db.pool.query(`select count(*)::int as n from standings where league = 'seriea'`)).rows[0].n, 2, "updated in place, not duplicated");
});

test("the note is trimmed, and the rank stored next to it is untouched", async () => {
  await standings.upsertStandingsResponse("ucl", response(2025, "g", [withNote("1", "Europa League knockout round playoffs\t", [["rank", "12"]])]));
  const { rows } = await db.pool.query(`select zone, rank from standings where league = 'ucl'`);
  assert.deepEqual(rows, [{ zone: "Europa League knockout round playoffs", rank: 12 }]);
});

test("La Liga 2025-26 as ESPN sent it: every noted row stores its note", async () => {
  const data = JSON.parse(readFileSync(new URL("./fixtures/espn-laliga-2025-standings.json", import.meta.url), "utf8"));
  assert.equal(await standings.upsertStandingsResponse("laliga", data), 20);
  const { rows } = await db.pool.query(`select rank, zone from standings where league = 'laliga' and season = 2025 order by rank`);
  assert.equal(rows.length, 20);
  assert.equal(rows[4].zone, "Champions League", "Betis, 5th");
  assert.equal(rows[9].zone, "Europa League", "Real Sociedad, 10th");
  assert.equal(rows[6].zone, "Conference League qualifying");
  assert.equal(rows[7].zone, null);
  assert.deepEqual(rows.filter((r) => r.zone === "Relegation").map((r) => r.rank), [18, 19, 20]);
});

test("a non-soccer entry's note is not stored", async () => {
  await standings.upsertStandingsResponse("nba", response(2025, "Eastern Conference", [withNote("1", "Clinched playoff berth", [["wins", "50"]])]));
  assert.deepEqual(await zones("nba"), [["1", null]]);
});
