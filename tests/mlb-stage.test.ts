// `games.stage` for MLB: the generated column must read baseball's season type the way it reads the
// NBA's and the NFL's, not fall back to the pre-stage "no round means regular season" rule. Without
// this, a 2026 preseason game and a World Series game would both be "regular", and every MLB player
// total on the site would count spring training.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { startTestDb, type TestDb } from "./helpers/testDb";

let db: TestDb;
// stage-backfill.ts reaches scripts/lib/db.ts, which needs DATABASE_URL at import time; startTestDb sets it.
let seasonTypesFor: typeof import("../scripts/lib/stage-backfill").seasonTypesFor;
before(async () => {
  db = await startTestDb();
  ({ seasonTypesFor } = await import("../scripts/lib/stage-backfill"));
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
    [league, `mlbstage${n}`, seasonType, competitionType, round],
  );
  const { rows } = await db.pool.query(`select stage from games where league = $1 and espn_id = $2`, [league, `mlbstage${n}`]);
  return rows[0].stage;
}

test("an MLB game's stage follows ESPN's season type", async () => {
  assert.equal(await stageOf("mlb", 1, "STD", null), "excluded", "spring training is not a real game");
  assert.equal(await stageOf("mlb", 2, "STD", null), "regular");
  assert.equal(await stageOf("mlb", 3, "RD16", "NL Wild Card - Game 3"), "playoffs");
  assert.equal(await stageOf("mlb", 3, "FINAL", "World Series - Game 7"), "playoffs");
});

test("the MLB All-Star game is an exhibition, counted in nothing", async () => {
  assert.equal(await stageOf("mlb", 2, "ALLSTAR", null), "excluded");
});

test("baseball has no play-in, and an MLB game with no known type keeps the old reading", async () => {
  // Season type 5 is the NBA's play-in and nothing in baseball; a row that somehow carried it would
  // still be classified rather than left null, which is what the shared CASE arm gives.
  assert.equal(await stageOf("mlb", null, null, null), "regular");
  assert.equal(await stageOf("mlb", null, null, "NL Wild Card - Game 3"), "playoffs");
});

test("the other sports' stages are unchanged by baseball joining the CASE", async () => {
  assert.equal(await stageOf("nba", 5, "STD", null), "playin");
  assert.equal(await stageOf("nfl", 1, "STD", null), "excluded");
  assert.equal(await stageOf("epl", null, null, null), "regular");
  assert.equal(await stageOf("ipl", null, null, "Qualifier 1"), "other");
});

test("re-running the schema over the old two-league column replaces it, and leaves an up-to-date one alone", async () => {
  const schema = readFileSync(resolve(process.cwd(), "db/schema.sql"), "utf8");
  const definition = async () =>
    (
      await db.pool.query(
        `select pg_get_expr(d.adbin, d.adrelid) as def from pg_attribute a
         join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
         where a.attrelid = 'games'::regclass and a.attname = 'stage' and a.attgenerated = 's'`,
      )
    ).rows[0]?.def as string | undefined;

  // The column as it stood before baseball: an MLB postseason game reads "other", not "playoffs".
  await db.pool.query(`alter table games drop column stage`);
  await db.pool.query(`alter table games add column stage text generated always as (
    case
      when league not in ('nba', 'nfl') then case when round is null then 'regular' else 'other' end
      when competition_type in ('ALLSTAR', 'CC') then 'excluded'
      when season_type = 1 then 'excluded'
      when season_type = 2 then 'regular'
      when season_type = 3 then 'playoffs'
      when season_type = 5 then 'playin'
      when round is null then 'regular'
      else 'playoffs'
    end) stored`);
  assert.equal(await stageOf("mlb", 3, "RD16", "NL Wild Card - Game 3"), "other", "the old column really is wrong for MLB");

  await db.pool.query(schema);
  const upgraded = await definition();
  assert.match(String(upgraded), /'mlb'/, "the migration replaced the stored expression");
  assert.equal(await stageOf("mlb", 3, "RD16", "NL Wild Card - Game 3"), "playoffs");
  assert.equal(await stageOf("mlb", 1, "STD", null), "excluded");

  // A second run is a no-op: the column, and the rows it already computed, are left exactly as they are.
  await db.pool.query(schema);
  assert.equal(await definition(), upgraded);
  assert.equal(await stageOf("mlb", 2, "STD", null), "regular");
});

test("the stage backfill fetches MLB's regular season and its postseason, and no play-in", () => {
  assert.deepEqual(seasonTypesFor("mlb"), [undefined, 3]);
  assert.deepEqual(seasonTypesFor("nba"), [undefined, 3, 5]);
  assert.deepEqual(seasonTypesFor("epl"), [undefined]);
});
