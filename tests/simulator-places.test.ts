import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { startTestDb, type TestDb } from "./helpers/testDb";
import type { League } from "../src/lib/leagues";
import { zoneRules } from "../src/lib/standingsZones";

// The projections page words its soccer columns from the same rule the standings table is banded by: three
// relegation places in the Premier League, La Liga and Serie A; two plus a play-off place (16th) in the Bundesliga.
let simulator: typeof import("../src/lib/simulator");
let db: TestDb;
before(async () => {
  db = await startTestDb();
  simulator = await import("../src/lib/simulator");
});
after(async () => {
  await (await import("../src/lib/db")).pool.end();
  await db?.stop();
});

const column = (league: League, key: string) => simulator.columnsFor(league).find((c) => c.key === key)!;

test("the relegation column is worded per league: bottom three, or bottom two with the play-off place left out (Bundesliga)", () => {
  for (const league of ["epl", "laliga", "seriea"] as League[]) {
    assert.equal(column(league, "relegation").title, "Finish in the bottom three (the relegation places)", league);
  }
  const b = column("bundesliga", "relegation").title;
  assert.match(b, /^Finish in the bottom two \(the relegation places\)/);
  assert.match(b, /relegation play-off, which is not counted here/);
  assert.ok(!/three/.test(b));
});

test("the top column is the Champions League places of the table's own rule", () => {
  for (const league of ["epl", "laliga", "seriea", "bundesliga"] as League[]) {
    const col = column(league, "top4");
    assert.equal(col.label, "Top 4", league);
    assert.match(col.title, /^Finish in the top four \(the Champions League places at the start of the season\)$/, league);
  }
});

test("the number of places a column counts is the number of bands the table shades, for every domestic league", () => {
  for (const [league, size] of [["epl", 20], ["laliga", 20], ["seriea", 20], ["bundesliga", 18]] as [League, number][]) {
    const rules = zoneRules(league, size)!;
    const banded = (label: string) => Array.from({ length: size }, (_, i) => rules(i + 1)?.label).filter((l) => l === label).length;
    const places = simulator.soccerPlaces(league)!;
    assert.equal(places.top, banded("Champions League"), league);
    assert.equal(places.relegation, banded("Relegation"), league);
    assert.equal(places.relegationPlayoff, banded("Relegation play-off"), league);
  }
});

test("the Champions League and other sports keep their own columns", () => {
  assert.deepEqual(simulator.columnsFor("ucl").map((c) => c.key), ["first", "top8", "playoff", "out"]);
  assert.deepEqual(simulator.columnsFor("nba").map((c) => c.key), ["playoffs", "playin", "seed1", "best"]);
  assert.equal(simulator.soccerPlaces("ucl"), null);
});
