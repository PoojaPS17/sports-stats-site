// The daily F1 run completes a weekend the scoreboard saved with positions only (scripts/lib/f1-refresh.ts), on real ESPN core
// records of the 2026 Azerbaijan and Bahrain (Malaysia) Grands Prix, the two races that were stored with no team, status or laps.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { startTestDb, type TestDb } from "./helpers/testDb";

const fx = JSON.parse(readFileSync("tests/fixtures/f1/espn-core-2026-azerbaijan-bahrain.json", "utf8"));
const AZ = "600057444";
const BH = "600060990";
const LAWSON = "5741";

let db: TestDb;
let refresh: typeof import("../scripts/lib/f1-refresh");
let weekend: typeof import("../scripts/lib/f1-weekend");
before(async () => {
  db = await startTestDb();
  refresh = await import("../scripts/lib/f1-refresh");
  weekend = await import("../scripts/lib/f1-weekend");
});
after(async () => {
  await db.stop();
});

// What site.api's scoreboard carries: the order, the winner flag and the driver's name; no vehicle, no status, no statistics.
function scoreboardShape(id: string) {
  const e = fx.events[id];
  return {
    id: e.id,
    name: e.name,
    date: e.date,
    endDate: e.endDate,
    competitions: e.competitions.map((c: { id: string; date: string; type: unknown; competitors: { id: string; order: number; winner: boolean }[] }) => ({
      id: c.id,
      date: c.date,
      type: c.type,
      status: { type: { state: "post", detail: "Final", completed: true } },
      competitors: c.competitors.map((k: { id: string; order: number; winner: boolean }) => ({ id: k.id, order: k.order, winner: k.winner, athlete: { displayName: `Driver ${k.id}` } })),
    })),
  };
}

const fetchRef = async (ref: string) => {
  if (!(ref in fx.refs)) throw new Error(`unexpected request ${ref}`);
  return fx.refs[ref];
};
const deps = { fetchEvent: async (id: string) => fx.events[id], fetchRef };

async function race(eventId: string) {
  const { rows } = await db.pool.query(
    `select r.driver_espn_id, r.position, r.winner, r.constructor_name, r.car_number, r.status, r.laps
     from f1_session_results r join f1_sessions s on s.espn_id = r.session_espn_id where s.event_espn_id = $1 and s.session_type = 'Race' order by r.position`,
    [eventId]
  );
  return rows;
}

test("the scoreboard alone leaves the two races without team, status or laps (the bug)", async () => {
  await weekend.upsertF1Weekend(db.pool, scoreboardShape(AZ), 2026);
  await weekend.upsertF1Weekend(db.pool, scoreboardShape(BH), 2026);
  for (const id of [AZ, BH]) {
    const rows = await race(id);
    assert.equal(rows.length, 22);
    assert.ok(rows.every((r) => r.constructor_name === null && r.status === null && r.laps === null));
  }
  // and the weekends are exactly the ones the refresh selects, though both are more than 14 days old or not: the self-heal catches them
  const ids = await refresh.f1EventsToRefresh(db.pool, 2026);
  assert.deepEqual(new Set(ids), new Set([AZ, BH]));
});

test("the refresh fills team, car number, status and laps from the core records, and changes no position", async () => {
  const before = await race(AZ);
  const res = await refresh.refreshF1Results(db.pool, [AZ, BH], deps);
  assert.deepEqual(res.failures, []);
  assert.equal(res.events, 2);
  const az = await race(AZ);
  assert.deepEqual(az.map((r) => [r.driver_espn_id, r.position, r.winner]), before.map((r) => [r.driver_espn_id, r.position, r.winner]));
  assert.ok(az.every((r) => r.constructor_name && r.car_number && r.status));
  assert.equal(az.find((r) => r.driver_espn_id === LAWSON)?.constructor_name, "Racing Bulls");
  assert.equal(az.filter((r) => r.status === "STATUS_RETIRED").length, 7);
  assert.equal(az.find((r) => r.position === 1)?.laps, 51);
  assert.equal(az.find((r) => r.driver_espn_id === "4775")?.laps, 7); // Stroll, 22nd, retired on lap 7
  const bh = await race(BH);
  assert.equal(bh.filter((r) => r.status === "STATUS_RETIRED").length, 3);
  assert.equal(bh.find((r) => r.driver_espn_id === "4665")?.constructor_name, "Red Bull");
  assert.equal(bh.find((r) => r.position === 1)?.laps, 55);
});

test("practice and qualifying rows get their team too", async () => {
  const { rows } = await db.pool.query(
    `select count(*)::int n, count(r.constructor_name)::int teams from f1_session_results r join f1_sessions s on s.espn_id = r.session_espn_id where s.event_espn_id = $1 and s.session_type = 'Qual'`,
    [AZ]
  );
  assert.deepEqual(rows[0], { n: 22, teams: 22 });
});

test("a second run changes nothing and asks ESPN for no status or laps again", async () => {
  const before = JSON.stringify([await race(AZ), await race(BH)]);
  const asked: string[] = [];
  const res = await refresh.refreshF1Results(db.pool, [AZ, BH], { fetchEvent: deps.fetchEvent, fetchRef: async (ref) => (asked.push(ref), fetchRef(ref)) });
  assert.deepEqual(res.failures, []);
  assert.equal(JSON.stringify([await race(AZ), await race(BH)]), before);
  assert.deepEqual(asked, []);
  // Both weekends are inside the 14-day window the run reads again whatever it holds; move them out of it to see the self-heal alone.
  await db.pool.query("update f1_events set date = date - interval '200 days', end_date = end_date - interval '200 days' where espn_id in ($1, $2)", [AZ, BH]);
  assert.deepEqual(await refresh.f1EventsToRefresh(db.pool, 2026), [], "nothing is left to heal");
});

test("a failed request leaves the stored values alone and is reported", async () => {
  await db.pool.query("update f1_session_results set status = null, laps = null where driver_espn_id = '5503' and session_espn_id in (select espn_id from f1_sessions where event_espn_id = $1 and session_type = 'Race')", [BH]);
  const res = await refresh.refreshF1Results(db.pool, [BH], { fetchEvent: deps.fetchEvent, fetchRef: async () => { throw new Error("boom"); } });
  assert.ok(res.failures.length >= 1);
  const rows = await race(BH);
  assert.equal(rows.find((r) => r.driver_espn_id === "5503")?.constructor_name, "Mercedes");
  assert.equal(rows.find((r) => r.driver_espn_id === "4665")?.status, "STATUS_CLASSIFIED"); // untouched
  const ok = await refresh.refreshF1Results(db.pool, [BH], deps);
  assert.deepEqual(ok.failures, []);
  assert.equal((await race(BH)).find((r) => r.driver_espn_id === "5503")?.status, "STATUS_RETIRED");
});

test("a session the scoreboard has not finished is not read, and the sessions' own status is never rewritten", async () => {
  await db.pool.query("update f1_sessions set status_state = 'in', status_detail = 'Live', completed = false where event_espn_id = $1 and session_type = 'Race'", [AZ]);
  await db.pool.query("update f1_session_results set laps = null where session_espn_id in (select espn_id from f1_sessions where event_espn_id = $1 and session_type = 'Race')", [AZ]);
  await refresh.refreshF1Results(db.pool, [AZ], deps);
  const s = (await db.pool.query("select status_state, status_detail, completed from f1_sessions where event_espn_id = $1 and session_type = 'Race'", [AZ])).rows[0];
  assert.deepEqual(s, { status_state: "in", status_detail: "Live", completed: false });
  assert.ok((await race(AZ)).every((r) => r.laps === null), "an in-play race is left to the scoreboard");
});

test("an event id ESPN does not return is a failure, not a write", async () => {
  const res = await refresh.refreshF1Results(db.pool, ["999"], { fetchEvent: async () => fx.events[BH], fetchRef });
  assert.equal(res.events, 0);
  assert.equal(res.failures.length, 1);
});
