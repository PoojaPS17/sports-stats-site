import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { startTestDb, type TestDb } from "./helpers/testDb";

let db: TestDb;
let lib: typeof import("../scripts/lib/f1-weekend");
before(async () => {
  db = await startTestDb();
  lib = await import("../scripts/lib/f1-weekend");
});
after(async () => {
  await db.stop();
});

function weekend(o: { name: string; qualDate: string; qualState: string; winner: boolean }) {
  return {
    id: "evt1",
    name: o.name,
    shortName: "GP",
    date: "2026-09-18T10:00:00Z",
    endDate: "2026-09-20T18:00:00Z",
    competitions: [
      {
        id: "s-qual",
        date: o.qualDate,
        type: { abbreviation: "Qual" },
        status: { type: { state: o.qualState, detail: o.qualState, completed: o.qualState === "post" } },
        circuit: { fullName: "Test Circuit", address: { city: "Testville", country: "Testland" } },
        competitors: [
          { id: "d1", order: 1, winner: o.winner, athlete: { displayName: "Driver One" }, vehicle: { manufacturer: "Team A", number: "1" } },
          { id: "d2", order: 2, winner: false, athlete: { displayName: "Driver Two" }, vehicle: { manufacturer: "Team B", number: "2" } },
        ],
      },
    ],
  };
}

test("first save stores the event, session and results", async () => {
  const res = await lib.upsertF1Weekend(db.pool, weekend({ name: "Test Grand Prix", qualDate: "2026-09-19T14:00:00Z", qualState: "pre", winner: false }), 2026);
  assert.deepEqual(res, { sessions: 1, results: 2 });
});

test("a rescheduled session and a renamed event reach the database on the next run", async () => {
  await lib.upsertF1Weekend(db.pool, weekend({ name: "Test Grand Prix 2026", qualDate: "2026-09-19T16:30:00Z", qualState: "post", winner: true }), 2026);
  const session = (await db.pool.query("select date, status_state, completed from f1_sessions where espn_id = 's-qual'")).rows[0];
  assert.equal(session.date.toISOString(), "2026-09-19T16:30:00.000Z");
  assert.equal(session.status_state, "post");
  assert.equal(session.completed, true);
  const event = (await db.pool.query("select name, season_year from f1_events where espn_id = 'evt1'")).rows[0];
  assert.equal(event.name, "Test Grand Prix 2026");
  assert.equal(event.season_year, 2026);
  const winner = (await db.pool.query("select winner from f1_session_results where driver_espn_id = 'd1'")).rows[0];
  assert.equal(winner.winner, true);
});
