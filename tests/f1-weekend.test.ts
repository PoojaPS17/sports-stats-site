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

test("a run whose feed omits shortName keeps the stored short name", async () => {
  const base = { ...weekend({ name: "Short Name Grand Prix", qualDate: "2026-10-03T14:00:00Z", qualState: "pre", winner: false }), id: "evt-short" };
  await lib.upsertF1Weekend(db.pool, base, 2026);
  await lib.upsertF1Weekend(db.pool, { ...base, shortName: undefined }, 2026);
  const event = (await db.pool.query("select short_name from f1_events where espn_id = 'evt-short'")).rows[0];
  assert.equal(event.short_name, "GP");
});

// BUG-6. ESPN's scoreboard puts the circuit on the event itself (event.circuit), not on its sessions: this is
// sports.core/site.api's real 2026 Azerbaijan Grand Prix weekend (site.api.espn.com/apis/site/v2/sports/racing/f1/scoreboard).
const BAKU = { id: "607", fullName: "Baku City Circuit", address: { city: "Baku", country: "Azerbaijan" } };
function scoreboardEvent(o: { id: string; circuit?: typeof BAKU }) {
  return {
    id: o.id,
    name: "Qatar Airways Azerbaijan Grand Prix",
    date: "2026-09-24T08:30Z",
    endDate: "2026-09-26T11:00Z",
    circuit: o.circuit,
    competitions: [{ id: `${o.id}-race`, date: "2026-09-26T11:00Z", type: { abbreviation: "Race" }, status: { type: { state: "pre", detail: "Sat", completed: false } }, competitors: [] }],
  };
}

test("the circuit on the scoreboard event itself is saved (2026 Azerbaijan Grand Prix had no venue)", async () => {
  await lib.upsertF1Weekend(db.pool, scoreboardEvent({ id: "evt-baku", circuit: BAKU }), 2026);
  const e = (await db.pool.query("select circuit_name, circuit_city, circuit_country from f1_events where espn_id = 'evt-baku'")).rows[0];
  assert.deepEqual(e, { circuit_name: "Baku City Circuit", circuit_city: "Baku", circuit_country: "Azerbaijan" });
});

test("a run whose feed carries no circuit keeps the stored one", async () => {
  await lib.upsertF1Weekend(db.pool, scoreboardEvent({ id: "evt-baku" }), 2026);
  const e = (await db.pool.query("select circuit_name, circuit_city, circuit_country from f1_events where espn_id = 'evt-baku'")).rows[0];
  assert.deepEqual(e, { circuit_name: "Baku City Circuit", circuit_city: "Baku", circuit_country: "Azerbaijan" });
});
