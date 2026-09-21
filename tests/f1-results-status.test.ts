// The stored status and laps of a race driver: the migration, the ingest (from a real ESPN competitor) and what the site reads back.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { startTestDb, type TestDb } from "./helpers/testDb";

let db: TestDb;
let f1: typeof import("../src/lib/f1");
let weekend: typeof import("../scripts/lib/f1-weekend");
const bahrain = JSON.parse(readFileSync("tests/fixtures/f1/espn-race-competitors-2016-bahrain.json", "utf8"));
const us2019: { rows: { id: string; name: string; order: number; winner: boolean; status: string; laps: number | null }[] } = JSON.parse(readFileSync("tests/fixtures/f1/espn-race-status-laps.json", "utf8"))["23478"];
const monaco2019: { rows: { id: string; name: string; order: number; startOrder: number; status: string; laps: number }[] } = JSON.parse(readFileSync("tests/fixtures/f1/espn-race-status-laps.json", "utf8"))["23465"];

before(async () => {
  db = await startTestDb();
  f1 = await import("../src/lib/f1");
  weekend = await import("../scripts/lib/f1-weekend");
});
after(async () => {
  await (await import("../src/lib/db")).pool.end();
  await db.stop();
});

test("migration: status and laps are added to f1_session_results, and applying the schema again changes nothing", async () => {
  const columns = async () =>
    (await db.pool.query(`select column_name, data_type from information_schema.columns where table_name = 'f1_session_results' and column_name in ('status', 'laps') order by column_name`)).rows;
  assert.deepEqual(await columns(), [{ column_name: "laps", data_type: "integer" }, { column_name: "status", data_type: "text" }]);
  await db.pool.query(`insert into f1_session_results (session_espn_id, driver_espn_id, position) values ('mig', 'd', 3)`);
  const schema = readFileSync(resolve(process.cwd(), "db/schema.sql"), "utf8");
  await db.pool.query(schema);
  await db.pool.query(schema);
  assert.equal((await columns()).length, 2);
  const row = (await db.pool.query(`select position, status, laps from f1_session_results where session_espn_id = 'mig'`)).rows[0];
  assert.deepEqual(row, { position: 3, status: null, laps: null });
});

// The scoreboard shape (a driver name on the competitor) around ESPN's own competitor records; each competitor's `status`
// and `statistics` are the bare $refs ESPN gives, served from the fixture.
function bahrainEvent() {
  const byRef = new Map<string, unknown>();
  for (const c of bahrain.competitors) {
    byRef.set(c.status.$ref, bahrain.status[c.id]);
    byRef.set(c.statistics.$ref, bahrain.statistics[c.id]);
  }
  const requested: string[] = [];
  const fetchRef = async (ref: string) => {
    requested.push(ref);
    if (!byRef.has(ref)) throw new Error(`unexpected request ${ref}`);
    return byRef.get(ref);
  };
  const event = {
    id: "18771",
    name: "Bahrain Grand Prix",
    date: "2016-04-01T00:00:00Z",
    competitions: [
      {
        id: bahrain.event.competition,
        date: "2016-04-03T15:00:00Z",
        type: { abbreviation: "Race" },
        status: { type: { state: "post", detail: "Final", completed: true } },
        competitors: bahrain.competitors.map((c: { id: string }) => ({ ...c, athlete: { displayName: `Driver ${c.id}` } })),
      },
    ],
  };
  return { event, fetchRef, requested };
}

test("ingest: a race driver's status and laps come from ESPN's status/statistics refs; a Friday-only driver is not a result", async () => {
  const { event, fetchRef, requested } = bahrainEvent();
  // a row an earlier run stored for the Friday-only driver (4734) goes
  await weekend.upsertF1Weekend(db.pool, { ...event, competitions: [{ ...event.competitions[0], competitors: [event.competitions[0].competitors[0]] }] }, 2016);
  await db.pool.query(`insert into f1_session_results (session_espn_id, driver_espn_id) values ($1, '4734')`, [bahrain.event.competition]);

  const res = await weekend.upsertF1Weekend(db.pool, event, 2016, { fetchRef });
  assert.deepEqual(res, { sessions: 1, results: 5 }); // six competitors, one only drove on Friday
  const rows = (await db.pool.query(`select driver_espn_id, position, status, laps from f1_session_results where session_espn_id = $1 order by driver_espn_id`, [bahrain.event.competition])).rows;
  const byDriver = Object.fromEntries(rows.map((r) => [r.driver_espn_id, r]));
  assert.equal(byDriver["4734"], undefined);
  assert.deepEqual(byDriver["783"], { driver_espn_id: "783", position: 1, status: "STATUS_CLASSIFIED", laps: 57 }); // the winner's laps are the race distance
  assert.equal(byDriver["4623"].laps, null); // another finisher's laps are not asked for
  assert.deepEqual(byDriver["4686"], { driver_espn_id: "4686", position: null, status: "STATUS_RETIRED", laps: 29 }); // ESPN gave Sainz no order in 2016
  assert.deepEqual(byDriver["864"], { driver_espn_id: "864", position: null, status: "STATUS_RETIRED", laps: 0 });
  assert.ok(!requested.some((r) => r.includes("/competitors/4734/")), "no request for the Friday-only driver");
  // 5 statuses + laps for the 3 retirements (Button, Vettel, Sainz) and the winner
  assert.equal(requested.length, 5 + 3 + 1);
});

test("ingest: a second run does not ask again for a driver whose status is stored, and a failed request keeps what was stored", async () => {
  const { event } = bahrainEvent();
  let asked = 0;
  await weekend.upsertF1Weekend(db.pool, event, 2016, { fetchRef: async () => { asked++; throw new Error("ESPN down"); } });
  assert.equal(asked, 0);
  const sainz = (await db.pool.query(`select status, laps from f1_session_results where session_espn_id = $1 and driver_espn_id = '4686'`, [bahrain.event.competition])).rows[0];
  assert.deepEqual(sainz, { status: "STATUS_RETIRED", laps: 29 });
  // a driver ESPN's feed gives no status for (a scoreboard without refs) keeps the stored one too
  const bare = { ...event, competitions: [{ ...event.competitions[0], competitors: event.competitions[0].competitors.map((c: object) => ({ ...c, status: undefined, statistics: undefined })) }] };
  await weekend.upsertF1Weekend(db.pool, bare, 2016);
  assert.equal((await db.pool.query(`select status from f1_session_results where session_espn_id = $1 and driver_espn_id = '312'`, [bahrain.event.competition])).rows[0].status, "STATUS_RETIRED");
});

test("ingest: a scoreboard that carries the status inline is used as it is", async () => {
  const event = {
    id: "inline-evt", name: "Inline Grand Prix", date: "2026-05-01T00:00:00Z",
    competitions: [{
      id: "inline-race", date: "2026-05-03T13:00:00Z", type: { abbreviation: "Race" }, status: { type: { state: "post", detail: "Final", completed: true } },
      competitors: [
        { id: "i1", order: 1, winner: true, athlete: { displayName: "Inline One" }, status: { type: { name: "STATUS_CLASSIFIED" } }, vehicle: { manufacturer: "Team A", number: "1" } },
        { id: "i2", order: 2, winner: false, athlete: { displayName: "Inline Two" }, status: { type: { name: "STATUS_RETIRED" } }, statistics: [{ name: "lapsCompleted", value: 17 }], vehicle: { manufacturer: "Team B", number: "2" } },
      ],
    }],
  };
  await weekend.upsertF1Weekend(db.pool, event, 2026);
  const rows = (await db.pool.query(`select driver_espn_id, status, laps from f1_session_results where session_espn_id = 'inline-race' order by driver_espn_id`)).rows;
  assert.deepEqual(rows, [{ driver_espn_id: "i1", status: "STATUS_CLASSIFIED", laps: null }, { driver_espn_id: "i2", status: "STATUS_RETIRED", laps: 17 }]);
});

test("ingest: f1.com lists a driver who did not start where ESPN has no row (2023 Qatar, Sainz): the row is added once, with his team", async () => {
  const qual = { id: "qatar-qual", date: "2023-10-07T15:00:00Z", type: { abbreviation: "Qual" }, status: { type: { state: "post", detail: "Final", completed: true } }, competitors: [{ id: "4686", order: 3, winner: false, athlete: { displayName: "Carlos Sainz" }, vehicle: { manufacturer: "Ferrari", number: "55" } }] };
  const race = { id: "qatar-race", date: "2023-10-08T15:00:00Z", type: { abbreviation: "Race" }, status: { type: { state: "post", detail: "Final", completed: true } }, competitors: [{ id: "868", order: 1, winner: true, athlete: { displayName: "Lewis Hamilton" }, status: { type: { name: "STATUS_CLASSIFIED" } }, vehicle: { manufacturer: "Mercedes", number: "44" } }] };
  const event = { id: "600026765", name: "Qatar Airways Qatar Grand Prix", date: "2023-10-06T00:00:00Z", competitions: [qual, race] };
  await weekend.upsertF1Weekend(db.pool, event, 2023);
  await weekend.upsertF1Weekend(db.pool, event, 2023);
  const sainz = (await db.pool.query(`select position, winner, constructor_name, car_number, status from f1_session_results where session_espn_id = 'qatar-race' and driver_espn_id = '4686'`)).rows;
  assert.deepEqual(sainz, [{ position: null, winner: false, constructor_name: "Ferrari", car_number: "55", status: "STATUS_DID_NOT_START" }]);
  // the site lists him last with DNS, on the race page and on his own results
  const results = (await f1.getF1EventResults("600026765")).filter((r) => r.session_type === "Race");
  // (Hamilton retired on the first lap: f1.com prints DNF for him, so Ret)
  assert.deepEqual(results.map((r) => [r.driver_name, r.result_label]), [["Lewis Hamilton", "Ret"], ["Carlos Sainz", "DNS"]]);
});

test("read: 2019 Monaco is in f1.com's order with Magnussen's place corrected, Leclerc labelled Ret, the winner first", async () => {
  await db.pool.query(`insert into f1_events (espn_id, name, date, season_year) values ('23465', 'Monaco Grand Prix', '2019-05-23T09:00:00Z', 2019)`);
  await db.pool.query(`insert into f1_sessions (espn_id, event_espn_id, session_type, date, completed) values ('monaco-race', '23465', 'Race', '2019-05-26T13:10:00Z', true), ('monaco-qual', '23465', 'Qual', '2019-05-25T13:00:00Z', true)`);
  for (const r of monaco2019.rows) {
    await db.pool.query(`insert into players (league, espn_id, name, slug) values ('f1', $1, $2, $3) on conflict (league, espn_id) do update set name = excluded.name, slug = excluded.slug`, [r.id, r.name, r.name.toLowerCase().replace(/[^a-z]+/g, "-")]);
    await db.pool.query(`insert into f1_session_results (session_espn_id, driver_espn_id, position, winner, constructor_name, status, laps) values ('monaco-race', $1, $2, $3, 'Team', $4, $5)`, [r.id, r.order, r.order === 1, r.status, r.laps]);
    await db.pool.query(`insert into f1_session_results (session_espn_id, driver_espn_id, position, winner, constructor_name) values ('monaco-qual', $1, $2, false, 'Team')`, [r.id, r.order]);
  }
  const results = await f1.getF1EventResults("23465");
  const race = results.filter((r) => r.session_type === "Race");
  const surname = (r: { driver_name: string }) => r.driver_name.split(" ").slice(-1)[0];
  assert.deepEqual(race.slice(0, 2).map(surname), ["Hamilton", "Vettel"]);
  assert.deepEqual(race.slice(10, 15).map((r) => [surname(r), r.position]), [["Norris", 11], ["Pérez", 12], ["Hülkenberg", 13], ["Magnussen", 14], ["Russell", 15]]);
  const leclerc = race[race.length - 1];
  assert.deepEqual([surname(leclerc), leclerc.position, leclerc.result_label, leclerc.status, leclerc.laps], ["Leclerc", null, "Ret", "STATUS_RETIRED", 16]);
  assert.equal(race.filter((r) => r.result_label).length, 1);
  // qualifying is untouched: ESPN's order and no labels
  const qual = results.filter((r) => r.session_type === "Qual");
  assert.deepEqual(qual.map((r) => r.position), monaco2019.rows.map((r) => r.order));
  assert.ok(qual.every((r) => r.result_label === null));
});

test("read: a driver's and a team's race results show the corrected position or the label", async () => {
  const magnussen = (await f1.getF1DriverResults("4623"))[0];
  assert.equal(magnussen.position, 14); // ESPN had him 12th; f1.com has him 14th
  assert.equal(magnussen.result_label, null);
  const leclerc = (await f1.getF1DriverResults("5498"))[0];
  assert.equal(leclerc.position, null);
  assert.equal(leclerc.result_label, "Ret");
  const team = await f1.getF1ConstructorResults("Team", 50);
  assert.equal(team.find((r) => r.driver_slug.startsWith("charles"))!.result_label, "Ret");
  assert.equal(team.find((r) => r.driver_slug.startsWith("kevin"))!.position, 14);
});

test("read: a driver stored as Friday-only (STATUS_FREE_PRACTICE) is in no race result", async () => {
  await db.pool.query(`insert into players (league, espn_id, name, slug) values ('f1', 'fp', 'Friday Only', 'friday-only')`);
  await db.pool.query(`insert into f1_session_results (session_espn_id, driver_espn_id, position, status, laps) values ('monaco-race', 'fp', null, 'STATUS_FREE_PRACTICE', 0)`);
  assert.ok(!(await f1.getF1EventResults("23465")).some((r) => r.driver_espn_id === "fp"));
  assert.deepEqual(await f1.getF1DriverResults("fp"), []);
});

test("read: before the backfill (no status stored) a race reads exactly as it did: ESPN's order and positions, no labels", async () => {
  await db.pool.query(`insert into f1_events (espn_id, name, date, season_year) values ('old-evt', 'Old Grand Prix', '2017-03-26T00:00:00Z', 2017)`);
  await db.pool.query(`insert into f1_sessions (espn_id, event_espn_id, session_type, date, completed) values ('old-race', 'old-evt', 'Race', '2017-03-26T05:00:00Z', true)`);
  for (const [id, pos] of [["o1", 2], ["o2", null], ["o3", 1]] as const) {
    await db.pool.query(`insert into players (league, espn_id, name, slug) values ('f1', $1, $1, $1)`, [id]);
    await db.pool.query(`insert into f1_session_results (session_espn_id, driver_espn_id, position) values ('old-race', $1, $2)`, [id, pos]);
  }
  const race = await f1.getF1EventResults("old-evt");
  assert.deepEqual(race.map((r) => [r.driver_espn_id, r.position, r.result_label]), [["o3", 1, null], ["o1", 2, null], ["o2", null, null]]);
});

test("read: a race outside the table (2019 US): drivers ESPN calls retired but who were classified keep their numbers on the race, driver and team pages; early retirees read Ret", async () => {
  await db.pool.query(`insert into f1_events (espn_id, name, date, season_year) values ('23478', 'United States Grand Prix', '2019-11-01T09:00:00Z', 2019)`);
  await db.pool.query(`insert into f1_sessions (espn_id, event_espn_id, session_type, date, completed) values ('us-race', '23478', 'Race', '2019-11-03T19:10:00Z', true)`);
  for (const r of us2019.rows) {
    await db.pool.query(`insert into players (league, espn_id, name, slug) values ('f1', $1, $2, $3) on conflict (league, espn_id) do update set name = excluded.name, slug = excluded.slug`, [r.id, r.name, r.name.toLowerCase().replace(/[^a-z]+/g, "-")]);
    await db.pool.query(`insert into f1_session_results (session_espn_id, driver_espn_id, position, winner, constructor_name, status, laps) values ('us-race', $1, $2, $3, 'UsTeam', $4, $5)`, [r.id, r.order, r.winner, r.status, r.laps]);
  }
  const surname = (r: { driver_name: string }) => r.driver_name.split(" ").slice(-1)[0];
  const race = (await f1.getF1EventResults("23478")).filter((r) => r.session_type === "Race");
  assert.deepEqual(race.slice(-7).map((r) => [surname(r), r.result_label ?? r.position]), [["Giovinazzi", 14], ["Grosjean", 15], ["Gasly", 16], ["Russell", 17], ["Magnussen", 18], ["Kubica", "Ret"], ["Vettel", "Ret"]]);
  const gasly = (await f1.getF1DriverResults("5501")).find((r) => r.event_espn_id === "23478")!;
  assert.deepEqual([gasly.position, gasly.result_label], [16, null]);
  const magnussen = (await f1.getF1DriverResults("4623")).find((r) => r.event_espn_id === "23478")!;
  assert.deepEqual([magnussen.position, magnussen.result_label], [18, null]);
  const vettel = (await f1.getF1DriverResults("864")).find((r) => r.event_espn_id === "23478")!;
  assert.deepEqual([vettel.position, vettel.result_label], [null, "Ret"]);
  const team = await f1.getF1ConstructorResults("UsTeam", 50);
  assert.deepEqual([team.find((r) => r.driver_slug.startsWith("pierre"))!.position, team.find((r) => r.driver_slug.startsWith("robert"))!.result_label], [16, "Ret"]);
});
