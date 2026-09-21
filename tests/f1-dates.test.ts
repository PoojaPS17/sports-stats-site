import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { startTestDb, type TestDb } from "./helpers/testDb";
import { f1FormatDate, f1RaceDay, f1RaceInstant, f1WeekendDays } from "../src/lib/f1Dates";

// Real ESPN events (sports.core.api.espn.com/v2/sports/racing/leagues/f1/events/<id>): `date` is the start of the FIRST session,
// `endDate` the start of the Race.
// 2018 Australian Grand Prix, event 18822: ESPN dates the event, and its second practice, 2018-02-23, a month early.
const AUSTRALIA_2018 = { date: "2018-02-23T05:00Z", end_date: "2018-03-25T05:00Z", race_date: "2018-03-25T05:00Z", circuit_name: "Melbourne Grand Prix Circuit" };
// 2025 Las Vegas Grand Prix, event 600052106: FP1 Thu 16:30 local, Race Sat 20:00 local (Sun 04:00 UTC).
const LAS_VEGAS_2025 = { date: "2025-11-21T00:30Z", end_date: "2025-11-23T04:00Z", race_date: "2025-11-23T04:00Z", circuit_name: "Las Vegas Street Circuit" };
// 2026 Australian Grand Prix: FP1 Fri Mar 6, Race Sun Mar 8.
const AUSTRALIA_2026 = { date: "2026-03-06T01:30Z", end_date: "2026-03-08T04:00Z", race_date: null, circuit_name: "Melbourne Grand Prix Circuit" };

test("BUG-7: the 2018 Australian Grand Prix is dated Mar 25, not the Feb 23 ESPN stamped on its event", () => {
  assert.equal(f1RaceDay(AUSTRALIA_2018), "2018-03-25");
  assert.equal(f1FormatDate(f1RaceInstant(AUSTRALIA_2018), AUSTRALIA_2018.circuit_name, { month: "short", day: "numeric" }), "Mar 25");
});

test("DEF-5: the race date is the Race session's, or the event's end date, never the first practice", () => {
  assert.equal(f1RaceDay(AUSTRALIA_2026), "2026-03-08");
  assert.equal(f1RaceInstant({ date: "2026-03-06T01:30Z", end_date: null, race_date: null, circuit_name: null }).toISOString(), "2026-03-06T01:30:00.000Z");
  assert.equal(f1RaceInstant({ date: new Date("2025-05-02T10:00:00Z"), end_date: new Date("2025-05-04T15:00:00Z"), race_date: null, circuit_name: null }).toISOString(), "2025-05-04T15:00:00.000Z");
});

test("Las Vegas 2025 is Nov 22 (the day at the circuit), not Nov 23 (UTC) or Nov 21 (first practice in UTC)", () => {
  assert.equal(f1RaceDay(LAS_VEGAS_2025), "2025-11-22");
  assert.equal(f1FormatDate(f1RaceInstant(LAS_VEGAS_2025), LAS_VEGAS_2025.circuit_name, { weekday: "long", month: "long", day: "numeric", year: "numeric" }), "Saturday, November 22, 2025");
  assert.deepEqual(f1WeekendDays(LAS_VEGAS_2025), { start: "2025-11-20", end: "2025-11-22" });
});

test("a weekend runs from the first session's day to the race day; an event date that is a month out falls back to Friday-Sunday", () => {
  assert.deepEqual(f1WeekendDays(AUSTRALIA_2026), { start: "2026-03-06", end: "2026-03-08" });
  assert.deepEqual(f1WeekendDays(AUSTRALIA_2018), { start: "2018-03-23", end: "2018-03-25" });
});

let db: TestDb;
let ics: typeof import("../src/lib/ics");
let f1: typeof import("../src/lib/f1");
let HomeLive: typeof import("../src/components/HomeLive");
before(async () => {
  db = await startTestDb();
  ics = await import("../src/lib/ics");
  f1 = await import("../src/lib/f1");
  HomeLive = await import("../src/components/HomeLive");
});
after(async () => {
  await (await import("../src/lib/db")).pool.end();
  await db.stop();
});

const row = (o: Partial<import("../src/lib/f1").F1EventRow> & { espn_id: string }) =>
  ({ name: "Test Grand Prix", short_name: null, date: "", end_date: null, race_date: null, season_year: 2025, circuit_name: null, circuit_city: null, circuit_country: null, winner_name: null, winner_slug: null, race_status_state: null, race_status_detail: null, race_completed: null, ...o }) as import("../src/lib/f1").F1EventRow;

test("the calendar feed: an all-day event from the first session's day to the race day (the old code went two days back from a Friday)", () => {
  const vegas = ics.f1WeekendEvent(row({ espn_id: "lv", ...LAS_VEGAS_2025 }));
  assert.equal(vegas.start.toISOString(), "2025-11-20T00:00:00.000Z");
  assert.equal(vegas.end!.toISOString(), "2025-11-23T00:00:00.000Z", "exclusive end: the day after the race day, Nov 22");
  const aus = ics.f1WeekendEvent(row({ espn_id: "au", ...AUSTRALIA_2026 }));
  assert.equal(aus.start.toISOString(), "2026-03-06T00:00:00.000Z");
  assert.equal(aus.end!.toISOString(), "2026-03-09T00:00:00.000Z");
  const aus18 = ics.f1WeekendEvent(row({ espn_id: "au18", ...AUSTRALIA_2018 }));
  assert.equal(aus18.start.toISOString(), "2018-03-23T00:00:00.000Z");
  assert.equal(aus18.end!.toISOString(), "2018-03-26T00:00:00.000Z");
});

test("the calendar feed, built from stored rows, gives the same days", async () => {
  await db.pool.query(`insert into f1_events (espn_id, name, date, end_date, season_year, circuit_name) values ('au18', 'Australian Grand Prix', $1, $2, 2018, $3)`, [AUSTRALIA_2018.date, AUSTRALIA_2018.end_date, AUSTRALIA_2018.circuit_name]);
  await db.pool.query(`insert into f1_sessions (espn_id, event_espn_id, session_type, date, completed) values ('r18', 'au18', 'Race', $1, true)`, [AUSTRALIA_2018.race_date]);
  const [event] = await f1.getF1Calendar(2018);
  assert.equal(new Date(event.race_date!).toISOString(), "2018-03-25T05:00:00.000Z");
  assert.equal(ics.f1WeekendEvent(event).end!.toISOString(), "2018-03-26T00:00:00.000Z");
});

test("the home card shows the race's weekday, date and time, not the practice day", () => {
  const html = renderToStaticMarkup(createElement(HomeLive.F1Card, { ev: row({ espn_id: "sep", name: "Azerbaijan Grand Prix", date: "2026-09-24T08:30:00Z", end_date: "2026-09-26T11:00:00Z", season_year: 2026, circuit_name: "Baku City Circuit", circuit_city: "Baku" }) }));
  assert.match(html, /dateTime="2026-09-26T11:00:00.000Z"/);
  assert.match(html, /Sat, Sep 26/);
  assert.match(html, /11:00 AM/);
  assert.doesNotMatch(html, /Sep 24/);
});
