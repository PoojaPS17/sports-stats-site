import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { startTestDb, type TestDb } from "./helpers/testDb";
import { stageLabel } from "../src/lib/gameStage";

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

test("stageLabel names the stages that are not a plain regular-season or playoff-round game", () => {
  assert.equal(stageLabel({ stage: "playin" }), "Play-In");
  assert.equal(stageLabel({ stage: "excluded", season_type: 1 }), "Preseason");
  assert.equal(stageLabel({ stage: "excluded", season_type: 2, competition_type: "CC" }), "NBA Cup final");
  assert.equal(stageLabel({ stage: "excluded", season_type: 3, competition_type: "ALLSTAR" }), "All-Star");
  // Play-in wins over the raw types; a preseason game is never a play-in.
  assert.equal(stageLabel({ stage: "playin", season_type: 5, competition_type: "STD" }), "Play-In");
});

test("stageLabel is null for regular-season and playoff rows, which keep their round label", () => {
  assert.equal(stageLabel({ stage: "regular", season_type: 2, competition_type: "STD" }), null);
  assert.equal(stageLabel({ stage: "playoffs", season_type: 3, competition_type: "QTR" }), null);
  assert.equal(stageLabel({ stage: "other" }), null);
  assert.equal(stageLabel({}), null);
  assert.equal(stageLabel({ stage: null, season_type: null, competition_type: null }), null);
});
