import { after, before, mock, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { startTestDb, type TestDb } from "./helpers/testDb";

// Real ESPN standings feed rows ([entity id, rank, points, wins]) for the seasons under test, and the drivers ESPN lists with a
// stored finishing position in a season's Race sessions (tests/fixtures/f1/, taken from sports.core.api.espn.com).
const STANDINGS: Record<string, [string, number, number | null, number | null][]> = JSON.parse(readFileSync(new URL("./fixtures/f1/espn-standings.json", import.meta.url), "utf8"));
const CLASSIFIED: Record<string, string[]> = JSON.parse(readFileSync(new URL("./fixtures/f1/race-classified-drivers.json", import.meta.url), "utf8"));

// The eleven teams scripts/seed-f1-teams.ts stores today (ESPN's teams list): a historical team such as Sauber is not among them.
const CURRENT_TEAMS: [string, string, string][] = [
  ["106922", "Alpine", "alpine"], ["123986", "Aston Martin", "aston-martin"], ["132212", "Audi", "audi"], ["132211", "Cadillac", "cadillac"],
  ["106842", "Ferrari", "ferrari"], ["111427", "Haas", "haas"], ["106892", "McLaren", "mclaren"], ["106893", "Mercedes", "mercedes"],
  ["123988", "Racing Bulls", "racing-bulls"], ["106921", "Red Bull", "red-bull"], ["106967", "Williams", "williams"],
];

let db: TestDb;
let f1: typeof import("../src/lib/f1");
before(async () => {
  db = await startTestDb();
  f1 = await import("../src/lib/f1");
  for (const [id, name, slug] of CURRENT_TEAMS) await db.pool.query(`insert into teams (league, espn_id, name, slug) values ('f1', $1, $2, $3)`, [id, name, slug]);
  const drivers = new Set<string>();
  for (const [key, rows] of Object.entries(STANDINGS)) {
    const [season, type] = key.split("-");
    for (const [id, rank, points, wins] of rows) {
      if (type === "driver") drivers.add(id);
      await db.pool.query(`insert into f1_standings (season_year, standings_type, entity_espn_id, position, points, wins) values ($1,$2,$3,$4,$5,$6)`, [Number(season), type, id, rank, points, wins]);
    }
  }
  for (const id of drivers) await db.pool.query(`insert into players (league, espn_id, name, slug) values ('f1', $1, $2, $3)`, [id, `Driver ${id}`, `driver-${id}`]);
});
after(async () => {
  await (await import("../src/lib/db")).pool.end();
  await db.stop();
});

test("BUG-1: 2025 constructors' standings keep Sauber (rank 9, 70 points), a team that is not among today's teams", async () => {
  const rows = await f1.getF1ConstructorStandings(2025);
  assert.equal(rows.length, 10);
  const sauber = rows.find((r) => r.position === 9)!;
  assert.equal(sauber.name, "Kick Sauber");
  assert.equal(sauber.points, 70);
  assert.equal(sauber.slug, null, "a historical team has no page to link to");
  assert.deepEqual(rows.map((r) => r.position), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
});

test("BUG-1: 2016 constructors' standings list all 11 teams, with the names they raced under", async () => {
  const rows = await f1.getF1ConstructorStandings(2016);
  assert.deepEqual(rows.map((r) => r.name), ["Mercedes", "Red Bull Racing", "Ferrari", "Force India", "Williams", "McLaren", "Toro Rosso", "Haas F1 Team", "Renault", "Sauber", "Manor"]);
  assert.equal(rows.find((r) => r.name === "Force India")!.slug, null);
  assert.equal(rows.find((r) => r.name === "Red Bull Racing")!.slug, "red-bull", "a current team still links to its page");
});

test("BUG-1: 2019 has Racing Point, Alfa Romeo Racing and Toro Rosso", async () => {
  const names = (await f1.getF1ConstructorStandings(2019)).map((r) => r.name);
  assert.ok(names.includes("Racing Point") && names.includes("Alfa Romeo Racing") && names.includes("Toro Rosso"));
  assert.equal(names.length, 10);
});

test("Group B: 2021 Verstappen has 395.5 points (FIA final classification), not the 413.5 in ESPN's feed", async () => {
  const rows = await f1.getF1DriverStandings(2021);
  const max = rows.find((r) => r.driver_espn_id === "4665")!;
  assert.equal(Number(max.points), 395.5);
  assert.equal(max.position, 1);
  assert.equal(rows[0].driver_espn_id, "4665");
});

test("Group B: 2021 Kubica is 20th and Mazepin 21st (ESPN has them the other way round), and the table is in rank order", async () => {
  // neither scored, so they are on the table for having raced
  await db.pool.query(`insert into f1_events (espn_id, name, date, season_year) values ('e2021', 'Test GP', '2021-06-01T12:00:00Z', 2021)`);
  await db.pool.query(`insert into f1_sessions (espn_id, event_espn_id, session_type, date, completed) values ('s2021', 'e2021', 'Race', '2021-06-01T12:00:00Z', true)`);
  await db.pool.query(`insert into f1_session_results (session_espn_id, driver_espn_id, position) values ('s2021', '836', 19), ('s2021', '5653', 20)`);
  const rows = await f1.getF1DriverStandings(2021);
  assert.equal(rows.find((r) => r.driver_espn_id === "836")!.position, 20);
  assert.equal(rows.find((r) => r.driver_espn_id === "5653")!.position, 21);
  assert.deepEqual(rows.map((r) => r.position), [...rows.map((r) => r.position)].sort((a, b) => a! - b!));
  assert.equal(rows[rows.length - 1].driver_espn_id, "5653");
});

test("Group B: 2020 Russell 3 points, 2019 Hamilton 413 points", async () => {
  await db.pool.query(`insert into f1_events (espn_id, name, date, season_year) values ('e2020', 'Test GP', '2020-06-01T12:00:00Z', 2020)`);
  await db.pool.query(`insert into f1_sessions (espn_id, event_espn_id, session_type, date, completed) values ('s2020', 'e2020', 'Race', '2020-06-01T12:00:00Z', true)`);
  await db.pool.query(`insert into f1_session_results (session_espn_id, driver_espn_id, position) values ('s2020', '5503', 9)`);
  assert.equal(Number((await f1.getF1DriverStandings(2020)).find((r) => r.driver_espn_id === "5503")!.points), 3);
  assert.equal(Number((await f1.getF1DriverStandings(2019)).find((r) => r.driver_espn_id === "868")!.points), 413);
});

test("Group B: 2020 constructors' wins are Mercedes 13 and Red Bull 2 (ESPN's constructor wins stat is wrong); other seasons untouched", async () => {
  const rows = await f1.getF1ConstructorStandings(2020);
  assert.equal(rows.find((r) => r.name === "Mercedes")!.wins, 13);
  assert.equal(rows.find((r) => r.name === "Red Bull Racing")!.wins, 2);
  assert.equal(rows.find((r) => r.name === "Racing Point")!.wins, 1);
  assert.equal((await f1.getF1ConstructorStandings(2019)).find((r) => r.name === "Mercedes")!.wins, 15);
});

async function seedRaces(season: number) {
  const eid = `e${season}`;
  await db.pool.query(`insert into f1_events (espn_id, name, date, season_year) values ($1, 'Test GP', $2, $3)`, [eid, `${season}-06-01T12:00:00Z`, season]);
  await db.pool.query(`insert into f1_sessions (espn_id, event_espn_id, session_type, date, completed) values ($1, $2, 'Race', $3, true)`, [`s${season}`, eid, `${season}-06-01T12:00:00Z`]);
  let n = 1;
  for (const id of CLASSIFIED[String(season)]) await db.pool.query(`insert into f1_session_results (session_espn_id, driver_espn_id, position) values ($1, $2, $3)`, [`s${season}`, id, n++]);
  // a practice session: every driver on the standings list turns up here, including the practice-only ones
  await db.pool.query(`insert into f1_sessions (espn_id, event_espn_id, session_type, date, completed) values ($1, $2, 'FP1', $3, true)`, [`p${season}`, eid, `${season}-05-31T12:00:00Z`]);
  for (const [id] of STANDINGS[`${season}-driver`]) await db.pool.query(`insert into f1_session_results (session_espn_id, driver_espn_id, position) values ($1, $2, 1) on conflict do nothing`, [`p${season}`, id]);
}

test("DEF-6: 2017 has 23 drivers and 2018 has 20: a driver stays with points, or a stored Race position, not for practice alone", async () => {
  await seedRaces(2017);
  await seedRaces(2018);
  assert.equal(STANDINGS["2017-driver"].length, 28);
  assert.equal((await f1.getF1DriverStandings(2017)).length, 23);
  assert.equal((await f1.getF1DriverStandings(2018)).length, 20);
});

test("Kick Sauber: a 2024 driver whose results carry no team is shown for Kick Sauber, and the other teams read as they raced", async () => {
  await db.pool.query(`insert into players (league, espn_id, name, slug) values ('f1', '4520', 'Valtteri Bottas', 'valtteri-bottas') on conflict do nothing`);
  await db.pool.query(`insert into players (league, espn_id, name, slug) values ('f1', '4510', 'Daniel Ricciardo', 'daniel-ricciardo') on conflict do nothing`);
  await db.pool.query(`insert into f1_standings (season_year, standings_type, entity_espn_id, position, points, wins) values (2024, 'driver', '4520', 1, 0, 0), (2024, 'driver', '4510', 2, 12, 0)`);
  await db.pool.query(`insert into f1_events (espn_id, name, date, season_year) values ('e2024', 'Test GP', '2024-06-01T12:00:00Z', 2024)`);
  await db.pool.query(`insert into f1_sessions (espn_id, event_espn_id, session_type, date, completed) values ('s2024', 'e2024', 'Race', '2024-06-01T12:00:00Z', true)`);
  await db.pool.query(`insert into f1_session_results (session_espn_id, driver_espn_id, position, constructor_name) values ('s2024', '4520', 15, null), ('s2024', '4510', 9, 'Racing Bulls')`);
  const rows = await f1.getF1DriverStandings(2024);
  assert.equal(rows.find((r) => r.driver_espn_id === "4520")!.constructor_name, "Kick Sauber");
  assert.equal(rows.find((r) => r.driver_espn_id === "4510")!.constructor_name, "RB", "the Racing Bulls team raced as RB in 2024");
  const results = await f1.getF1DriverResults("4520");
  assert.equal(results[0].constructor_name, "Kick Sauber");
});

test("2018: the Racing Point Force India entry reads Force India in the constructors' table", async () => {
  const names = (await f1.getF1ConstructorStandings(2018)).map((r) => r.name);
  assert.ok(names.includes("Force India") && !names.includes("Racing Point"));
  assert.ok(names.includes("Renault") && names.includes("Toro Rosso") && names.includes("Sauber"));
});

test("a manufacturer id nobody knows renders as 'Constructor <id>' and is logged once, however often the table is read", async () => {
  await db.pool.query(`insert into f1_standings (season_year, standings_type, entity_espn_id, position, points, wins) values (2025, 'constructor', '999001', 11, 0, 0)`);
  const warn = mock.method(console, "warn", () => {});
  try {
    const first = await f1.getF1ConstructorStandings(2025);
    await f1.getF1ConstructorStandings(2025);
    assert.equal(first.find((r) => r.team_espn_id === "999001")!.name, "Constructor 999001");
    const about = warn.mock.calls.filter((c) => String(c.arguments[0]).includes("999001"));
    assert.equal(about.length, 1);
    assert.match(String(about[0].arguments[0]), /unknown F1 constructor/i);
  } finally {
    warn.mock.restore();
    await db.pool.query(`delete from f1_standings where entity_espn_id = '999001'`);
  }
});

test("driver results and an event's classification use the season's team names too", async () => {
  await db.pool.query(`insert into f1_events (espn_id, name, date, season_year) values ('e2016', 'Test GP', '2016-06-01T12:00:00Z', 2016) on conflict do nothing`);
  await db.pool.query(`insert into f1_sessions (espn_id, event_espn_id, session_type, date, completed) values ('s2016b', 'e2016', 'Race', '2016-06-01T12:00:00Z', true)`);
  await db.pool.query(`insert into players (league, espn_id, name, slug) values ('f1', 'dx', 'Dee X', 'dee-x') on conflict do nothing`);
  await db.pool.query(`insert into f1_session_results (session_espn_id, driver_espn_id, position, constructor_name) values ('s2016b', 'dx', 3, 'Alpine')`);
  assert.equal((await f1.getF1DriverResults("dx"))[0].constructor_name, "Renault");
  assert.equal((await f1.getF1EventResults("e2016")).find((r) => r.driver_espn_id === "dx")!.constructor_name, "Renault");
  assert.equal((await f1.getF1ConstructorResults("Alpine")).find((r) => r.driver_slug === "dee-x")!.constructor_name, "Renault");
});
