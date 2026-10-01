import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { startTestDb, type TestDb } from "./helpers/testDb";

// getNextFixtureDate: kickoff of the earliest game still to be played, in the future and not called
// off. The homepage uses it to tell a league on a break from one between seasons; the league hub's
// recap already needed the same answer scoped to one season.
let db: TestDb;
let queries: typeof import("../src/lib/queries");

before(async () => {
  db = await startTestDb();
  queries = await import("../src/lib/queries");
});
after(async () => {
  await (await import("../src/lib/db")).pool.end();
  await db?.stop();
});
beforeEach(async () => {
  await db.pool.query(`delete from games`);
});

const DAY = 24 * 3600 * 1000;
const at = (days: number) => new Date(Date.now() + days * DAY).toISOString();

async function seed(g: { id: string; date: string; completed?: boolean; state?: string | null; detail?: string | null; season?: number }) {
  await db.pool.query(
    `insert into games (league, espn_id, date, name, season_year, home_team_espn_id, away_team_espn_id, home_score, away_score, completed, season_type, competition_type, status_state, status_detail)
     values ('epl', $1, $2, 'x', $3, '1', '2', $4, $4, $5, 2, 'STD', $6, $7)`,
    [g.id, g.date, g.season ?? 2026, g.completed ? 1 : null, g.completed ?? false, g.state ?? null, g.detail ?? null]
  );
}

test("returns the earliest future fixture, skipping played and called-off games", async () => {
  await seed({ id: "played", date: at(-11), completed: true, state: "post" });
  await seed({ id: "postponed", date: at(3), state: "post", detail: "Postponed" });
  await seed({ id: "next", date: at(9) });
  await seed({ id: "later", date: at(16) });
  const next = await queries.getNextFixtureDate("epl");
  assert.ok(next);
  assert.equal(Math.round((new Date(next).getTime() - Date.now()) / DAY), 9);
});

test("returns null when nothing is left to play", async () => {
  await seed({ id: "played", date: at(-30), completed: true, state: "post" });
  assert.equal(await queries.getNextFixtureDate("epl"), null);
});

test("a season filter ignores the next season's fixtures", async () => {
  await seed({ id: "next-season", date: at(60), season: 2027 });
  assert.equal(await queries.getNextFixtureDate("epl", 2026), null);
  assert.ok(await queries.getNextFixtureDate("epl"));
});
