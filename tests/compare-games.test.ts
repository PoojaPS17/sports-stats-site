import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { startTestDb, type TestDb } from "./helpers/testDb";
import { countRegularGames } from "../src/lib/compareGames";

const nbaLog = [{ stage: "regular" }, { stage: "regular" }, { stage: "playoffs" }, { stage: "playin" }, { stage: "excluded" }];

test("NBA and NFL count regular-season games only", () => {
  assert.equal(countRegularGames(nbaLog, "nba"), 2);
  assert.equal(
    countRegularGames([{ stage: "regular" }, { stage: "playoffs" }, { stage: "playoffs" }, { stage: "excluded" }, { stage: "regular" }, { stage: "regular" }], "nfl"),
    3
  );
});

test("soccer counts every row, including knockout rounds", () => {
  const rows = [{ stage: "regular" }, { stage: "other", round: "Semifinal" }, { stage: "other", round: "Final" }];
  assert.equal(countRegularGames(rows, "soccer"), 3);
});

test("a sport with no player pages (cricket) counts every row", () => {
  assert.equal(countRegularGames([{ stage: "regular" }, { stage: "other", round: "Qualifier 1" }, { stage: "other", round: "Final" }], null), 3);
});

test("a row with no stage falls back to round: none is regular, a round is not", () => {
  const rows = [{ stage: null, round: null }, { round: null }, { stage: null, round: "AFC Wild Card Playoffs" }];
  assert.equal(countRegularGames(rows, "nfl"), 2);
});

test("no rows counts zero", () => {
  assert.equal(countRegularGames([], "nba"), 0);
});

// The query behind the count, against a real games table: stage is generated there.
let db: TestDb;
let compare: typeof import("../src/lib/compare");
before(async () => {
  db = await startTestDb();
  compare = await import("../src/lib/compare");
});
after(async () => {
  await (await import("../src/lib/db")).pool.end();
  await db?.stop();
});

async function seed(league: string, games: { id: string; seasonType: number | null; competitionType?: string; round?: string }[]) {
  await db.pool.query(`insert into teams (league, espn_id, name, slug) values ($1, '1', 'One', 'one'), ($1, '2', 'Two', 'two') on conflict do nothing`, [league]);
  for (const p of ["p1", "p2"]) {
    await db.pool.query(`insert into players (league, espn_id, name, slug) values ($1, $2, $2, $2)`, [league, p]);
  }
  for (const g of games) {
    await db.pool.query(
      `insert into games (league, espn_id, date, name, home_team_espn_id, away_team_espn_id, completed, season_type, competition_type, round)
       values ($1, $2, now(), 'x', '1', '2', true, $3, $4, $5)`,
      [league, g.id, g.seasonType, g.competitionType ?? "STD", g.round ?? null]
    );
    // p2 played every game too, so the two sides can be told apart by their own counts.
    for (const p of g.id.endsWith("x") ? ["p1"] : ["p1", "p2"]) {
      await db.pool.query(`insert into player_game_stats (league, game_espn_id, player_espn_id, team_espn_id) values ($1, $2, $3, '1')`, [league, g.id, p]);
    }
  }
}

test("the comparison's games logged leaves out playoffs, play-in and games that are not counted (NBA)", async () => {
  await seed("nba", [
    { id: "r1", seasonType: 2 },
    { id: "r2", seasonType: 2 },
    { id: "po", seasonType: 3, competitionType: "QTR", round: "East 1st Round - Game 1" },
    { id: "pi", seasonType: 5 },
    { id: "pre", seasonType: 1 },
    { id: "cc", seasonType: 2, competitionType: "CC" },
    { id: "as", seasonType: 2, competitionType: "ALLSTAR" },
  ]);
  const cmp = await compare.getPlayerComparison("nba", "p1", "p2");
  assert.equal(cmp?.a.gamesLogged, 2);
  assert.equal(cmp?.b.gamesLogged, 2);
});

test("the comparison's games logged still counts every row for soccer", async () => {
  await seed("epl", [{ id: "m1", seasonType: null }, { id: "m2", seasonType: null, round: "Final" }, { id: "m3x", seasonType: null }]);
  const cmp = await compare.getPlayerComparison("epl", "p1", "p2");
  assert.equal(cmp?.a.gamesLogged, 3);
  assert.equal(cmp?.b.gamesLogged, 2);
});
