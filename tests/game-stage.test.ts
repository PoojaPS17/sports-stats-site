import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { startTestDb, type TestDb } from "./helpers/testDb";

let db: TestDb;
before(async () => {
  db = await startTestDb();
});
after(async () => {
  await db?.stop();
});

let n = 0;
async function stageOf(league: string, seasonType: number | null, competitionType: string | null, round: string | null): Promise<string> {
  n += 1;
  await db.pool.query(
    `insert into games (league, espn_id, date, name, home_team_espn_id, away_team_espn_id, season_type, competition_type, round)
     values ($1, $2, now(), 'x', '1', '2', $3, $4, $5)`,
    [league, `g${n}`, seasonType, competitionType, round]
  );
  const { rows } = await db.pool.query(`select stage from games where league = $1 and espn_id = $2`, [league, `g${n}`]);
  return rows[0].stage;
}

test("NBA/NFL stage follows ESPN's season and competition type", async () => {
  assert.equal(await stageOf("nba", 2, "STD", null), "regular");
  assert.equal(await stageOf("nba", 3, "QTR", "East 1st Round - Game 3"), "playoffs");
  assert.equal(await stageOf("nba", 5, "STD", null), "playin");
  assert.equal(await stageOf("nba", 1, "STD", null), "excluded");
  assert.equal(await stageOf("nba", 2, "CC", null), "excluded");
  assert.equal(await stageOf("nba", 2, "ALLSTAR", null), "excluded");
  assert.equal(await stageOf("nfl", 3, "ALLSTAR", null), "excluded");
  assert.equal(await stageOf("nfl", 3, "FINAL", "Super Bowl LX"), "playoffs");
});

test("an NBA/NFL game with no known type keeps today's meaning: no round is regular, a round is playoffs", async () => {
  assert.equal(await stageOf("nba", null, null, null), "regular");
  assert.equal(await stageOf("nfl", null, null, "AFC Wild Card Playoffs"), "playoffs");
});

test("every other league: no round is regular, anything else is 'other'", async () => {
  assert.equal(await stageOf("epl", null, null, null), "regular");
  assert.equal(await stageOf("ucl", null, null, "Round of 16 - 1st Leg"), "other");
  assert.equal(await stageOf("ipl", null, null, "Match 12"), "other");
});
