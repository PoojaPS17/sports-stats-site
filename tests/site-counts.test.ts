// The first-visit proof numbers are counted from stored rows: a player seen in box scores and in a season line is one
// page, the same person in two competitions is two pages, and only cricket matches with a scorecard are scorecards.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { startTestDb, type TestDb } from "./helpers/testDb";

let db: TestDb;
let readSiteCounts: typeof import("../src/lib/siteCounts").readSiteCounts;
before(async () => {
  db = await startTestDb();
  readSiteCounts = (await import("../src/lib/siteCounts")).readSiteCounts;
});
after(async () => {
  await (await import("../src/lib/db")).pool.end();
  await db?.stop();
});

const game = (league: string, id: string) =>
  db.pool.query(`insert into games (league, espn_id, date, name, home_team_espn_id, away_team_espn_id, completed) values ($1, $2, now(), 'A v B', '1', '2', true)`, [league, id]);
const box = (league: string, g: string, p: string) =>
  db.pool.query(`insert into player_game_stats (league, game_espn_id, player_espn_id, team_espn_id, stats) values ($1, $2, $3, '1', '{}'::jsonb)`, [league, g, p]);
const season = (league: string, p: string) => db.pool.query(`insert into player_season_stats (league, season, player_espn_id) values ($1, 2026, $2)`, [league, p]);

test("an empty database counts zero", async () => {
  assert.deepEqual(await readSiteCounts(), { playerPages: 0, cricketScorecards: 0 });
});

test("player pages are distinct (competition, player) pairs across box scores and season lines", async () => {
  await game("nba", "g1");
  await box("nba", "g1", "p1");
  await box("nba", "g1", "p2");
  await box("nba", "g2", "p1"); // the same player in a second game is still one page
  await season("nba", "p1"); // and a season line for a player already counted adds nothing
  await season("nba", "p3"); // a season line alone is a page
  await game("odi", "c1");
  await box("odi", "c1", "p1"); // the same id in another competition is another page
  const { playerPages } = await readSiteCounts();
  assert.equal(playerPages, 4);
});

test("cricket scorecards are cricket matches with stored player rows, nothing else", async () => {
  await game("t20i", "c2"); // no rows yet: not a scorecard
  await game("epl", "f1");
  await box("epl", "f1", "p9"); // football rows are not cricket scorecards
  const before = (await readSiteCounts()).cricketScorecards;
  assert.equal(before, 1); // only the ODI from the previous test
  await box("t20i", "c2", "p1");
  assert.equal((await readSiteCounts()).cricketScorecards, 2);
});
