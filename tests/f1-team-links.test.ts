import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { startTestDb, type TestDb } from "./helpers/testDb";

let db: TestDb;
let f1: typeof import("../src/lib/f1");

// Two drivers: one raced for Ferrari (a team with a page) and one for Sauber (no longer a team, so no page to link to).
before(async () => {
  db = await startTestDb();
  f1 = await import("../src/lib/f1");
  await db.pool.query(`insert into teams (league, espn_id, name, slug) values ('f1', '106842', 'Ferrari', 'ferrari')`);
  await db.pool.query(`insert into players (league, espn_id, name, slug) values ('f1', 'd1', 'Ferrari Driver', 'ferrari-driver'), ('f1', 'd2', 'Sauber Driver', 'sauber-driver')`);
  await db.pool.query(`insert into f1_events (espn_id, name, date, season_year) values ('ev1', 'Test GP', '2025-06-01T12:00:00Z', 2025)`);
  await db.pool.query(`insert into f1_sessions (espn_id, event_espn_id, session_type, date, completed) values ('se1', 'ev1', 'Race', '2025-06-01T12:00:00Z', true)`);
  await db.pool.query(
    `insert into f1_session_results (session_espn_id, driver_espn_id, position, constructor_name) values ('se1', 'd1', 1, 'Ferrari'), ('se1', 'd2', 2, 'Sauber')`
  );
  await db.pool.query(`insert into f1_standings (season_year, standings_type, entity_espn_id, position, points, wins) values (2025, 'driver', 'd1', 1, 25, 1), (2025, 'driver', 'd2', 2, 18, 0)`);
});
after(async () => {
  await (await import("../src/lib/db")).pool.end();
  await db.stop();
});

test("a race result row carries its team's page slug, and none for a team without a page", async () => {
  const rows = await f1.getF1EventResults("ev1");
  assert.equal(rows.find((r) => r.driver_espn_id === "d1")!.constructor_slug, "ferrari");
  const sauber = rows.find((r) => r.driver_espn_id === "d2")!;
  assert.equal(sauber.constructor_slug, null);
  assert.ok(sauber.constructor_name, "the name still shows, as plain text");
});

test("a driver's results and the drivers' standings carry the team slug too", async () => {
  assert.equal((await f1.getF1DriverResults("d1"))[0].constructor_slug, "ferrari");
  assert.equal((await f1.getF1DriverResults("d2"))[0].constructor_slug, null);
  const table = await f1.getF1DriverStandings(2025);
  assert.equal(table.find((r) => r.driver_espn_id === "d1")!.constructor_slug, "ferrari");
  assert.equal(table.find((r) => r.driver_espn_id === "d2")!.constructor_slug, null);
});
