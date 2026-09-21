import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { startTestDb, type TestDb } from "./helpers/testDb";
import { f1RaceName } from "../src/lib/f1RaceNames";

// [ESPN event id, the name ESPN gives, the name the reference site uses]; every one is a real event from
// sports.core.api.espn.com/v2/sports/racing/leagues/f1/seasons/<year>/types/2/events.
const CASES: [string, string, string][] = [
  // ESPN's own mistakes, by event id
  ["600006840", "Austrian Grand Prix", "Styrian Grand Prix"], // 2021-06-27
  ["600001764", "Austrian Grand Prix 2", "Austrian Grand Prix"], // 2021-07-04
  ["401220848", "Austrian Grand Prix 2", "Styrian Grand Prix"], // 2020-07-12
  ["401221786", "Pries Der Eifel Grand Prix", "Eifel Grand Prix"], // 2020-10-11
  ["401220871", "Rolex British Grand Prix 2", "70th Anniversary Grand Prix"], // 2020-08-09
  // sponsor prefixes
  ["600052106", "Heineken Las Vegas Grand Prix", "Las Vegas Grand Prix"],
  ["1", "Qatar Airways Azerbaijan Grand Prix", "Azerbaijan Grand Prix"],
  ["2", "Heineken Dutch Grand Prix", "Dutch Grand Prix"],
  ["3", "Aramco Spanish Grand Prix", "Spanish Grand Prix"],
  ["4", "Tag Heuer Spanish Grand Prix", "Spanish Grand Prix"],
  ["5", "AWS Made in Italy Emilia Romagna Grand Prix", "Emilia Romagna Grand Prix"],
  ["6", "Qatar Airways Qatar Grand Prix", "Qatar Grand Prix"],
  ["7", "Crypto.com Miami Grand Prix", "Miami Grand Prix"],
  ["8", "Etihad Airways Abu Dhabi Grand Prix", "Abu Dhabi Grand Prix"],
  ["9", "Moët & Chandon Belgian Grand Prix", "Belgian Grand Prix"],
  ["10", "MSC Cruises São Paulo Grand Prix", "São Paulo Grand Prix"],
  ["11", "Singapore Airlines Singapore Grand Prix", "Singapore Grand Prix"],
  ["12", "STC Saudi Arabian Grand Prix", "Saudi Arabian Grand Prix"],
  ["13", "Mercedes-Benz German Grand Prix", "German Grand Prix"],
  // already plain
  ["18822", "Australian Grand Prix", "Australian Grand Prix"],
  ["14", "Monaco Grand Prix", "Monaco Grand Prix"],
  ["15", "United States Grand Prix", "United States Grand Prix"],
];

test("f1RaceName: ESPN's wrong names are replaced by event id and sponsor prefixes are stripped", () => {
  for (const [id, espn, expected] of CASES) assert.equal(f1RaceName(id, espn), expected, `${id} ${espn}`);
});

// Every event name ESPN gives 2016-2026 (sports.core.api.espn.com .../seasons/<year>/types/2/events, 241 events), and the plain
// Grand Prix names the championship used. No title sponsor may survive, whichever sponsor ESPN used; a name outside this list fails.
const EVENT_NAMES: [string, string][] = JSON.parse(readFileSync(new URL("./fixtures/f1/espn-event-names.json", import.meta.url), "utf8"));
const PLAIN_NAMES = new Set(
  ["Abu Dhabi", "Australian", "Austrian", "Azerbaijan", "Bahrain", "Barcelona-Catalunya", "Belgian", "Brazilian", "British", "Canadian", "Chinese", "Dutch", "Eifel", "Emilia Romagna", "European",
   "French", "German", "Hungarian", "Italian", "Japanese", "Las Vegas", "Malaysian", "Mexican", "Mexico City", "Miami", "Monaco", "Portuguese", "Qatar", "Russian", "Sakhir", "Saudi Arabian",
   "Singapore", "São Paulo", "Spanish", "Styrian", "Turkish", "Tuscan", "United States", "70th Anniversary"].map((n) => `${n} Grand Prix`)
);

test("f1RaceName: every real ESPN event name comes out as a plain Grand Prix name, with no sponsor left", () => {
  assert.ok(EVENT_NAMES.length >= 240);
  const stray = EVENT_NAMES.map(([id, name]) => [id, name, f1RaceName(id, name)]).filter(([, , plain]) => !PLAIN_NAMES.has(plain));
  assert.deepEqual(stray, []);
});

test("2026 event 600060990 (Sepang, Oct 2-4) is the Bahrain Grand Prix: Wikipedia and Formula 1 say the rescheduled race kept its name", () => {
  assert.equal(f1RaceName("600060990", "Gulf Air Bahrain Grand Prix in Malaysia"), "Bahrain Grand Prix");
});

test("f1RaceName: a name that merely contains a sponsor word inside is left alone", () => {
  assert.equal(f1RaceName("x", "Rolex"), "Rolex");
  assert.equal(f1RaceName("x", "Pirellione Grand Prix"), "Pirellione Grand Prix");
});

let db: TestDb;
let f1: typeof import("../src/lib/f1");
let ics: typeof import("../src/lib/ics");
before(async () => {
  db = await startTestDb();
  f1 = await import("../src/lib/f1");
  ics = await import("../src/lib/ics");
  for (const [id, espn] of [["e-lv", "Heineken Las Vegas Grand Prix"], ["600006840", "Austrian Grand Prix"]]) {
    await db.pool.query(`insert into f1_events (espn_id, name, date, season_year) values ($1, $2, '2025-11-21T00:30:00Z', 2025)`, [id, espn]);
  }
  await db.pool.query(`insert into players (league, espn_id, name, slug) values ('f1', 'd1', 'Driver One', 'driver-one')`);
  await db.pool.query(`insert into f1_sessions (espn_id, event_espn_id, session_type, date, completed) values ('s1', '600006840', 'Race', '2025-11-23T04:00:00Z', true)`);
  await db.pool.query(`insert into f1_session_results (session_espn_id, driver_espn_id, position) values ('s1', 'd1', 1)`);
});
after(async () => {
  await (await import("../src/lib/db")).pool.end();
  await db.stop();
});

test("the calendar, an event, a driver's results and the calendar feed all show the clean name", async () => {
  const calendar = await f1.getF1Calendar(2025);
  assert.deepEqual(calendar.map((e) => e.name).sort(), ["Las Vegas Grand Prix", "Styrian Grand Prix"]);
  assert.equal((await f1.getF1Event("e-lv"))!.name, "Las Vegas Grand Prix");
  assert.equal((await f1.getF1DriverResults("d1"))[0].event_name, "Styrian Grand Prix");
  assert.match(ics.f1WeekendEvent(calendar.find((e) => e.espn_id === "e-lv")!).summary, /^Las Vegas Grand Prix/);
});
