// A cricket match's local date. ESPN's `date` is a UTC instant, so the Boxing Day Test in Melbourne
// (10.30 local) is "2025-12-25T23:30Z" and prints a day early; Cricinfo and Statsguru print the
// local day, and a Test as a range ("Dec 26-27, 2025"). The local days are in the event
// description and, on the summary feed, in a "matchdays" note.
//
// Strings below are real, copied from ESPN's feeds (read-only, no user agent):
//   https://site.api.espn.com/apis/site/v2/sports/cricket/8048/summary?event=<id>   (header.description, notes[type=matchdays])
//   https://site.api.espn.com/apis/site/v2/sports/cricket/21284/scoreboard?season=2024   (events[].description)
// Ids: 1455614 and 1426558/1426559 Melbourne and Sydney Tests, 1388226 Wellington, 1416080 Abu Dhabi,
// 1336044 Lord's (Ashes 2023), 1277079 Centurion. The two year-end and "29 Nov-3 Dec" wordings marked
// SYNTHETIC are not from a feed: they are the shapes ESPN's own wording implies for a match that
// crosses a month or a year boundary with the year written once or twice.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCricketLocalDates } from "../scripts/lib/cricket-dates";

const note = (text: string) => [{ text: "Australia led the 5-match series 3-1", type: "seriesnote" }, { text, type: "matchdays" }, { text: "10.30 start", type: "hoursofplay" }];

test("the Melbourne Test starting 23:30 UTC on Dec 25 is played on Dec 26, and ended Dec 27", () => {
  const r = parseCricketLocalDates("4th Test, England tour of Australia at Melbourne, Dec 26-27 2025", note("26,27 December 2025 (5-day match)"), "2025-12-25T23:30Z");
  assert.deepEqual(r, { localDate: "2025-12-26", endDate: "2025-12-27", source: "description" });
});

test("a five-day Test gets its last day", () => {
  const r = parseCricketLocalDates("4th Test, India tour of Australia at Melbourne, Dec 26-30 2024", note("26,27,28,29,30 December 2024 (5-day match)"), "2024-12-25T23:30Z");
  assert.equal(r.localDate, "2024-12-26");
  assert.equal(r.endDate, "2024-12-30");
});

test("a Test across a month boundary reads both months (description)", () => {
  const wellington = parseCricketLocalDates("1st Test, Australia tour of New Zealand at Wellington, Feb 29-Mar 3 2024", null, "2024-02-28T22:00Z");
  assert.equal(wellington.localDate, "2024-02-29");
  assert.equal(wellington.endDate, "2024-03-03");
  const abuDhabi = parseCricketLocalDates("Only Test, Ireland tour of United Arab Emirates at Abu Dhabi, Feb 28-Mar 1 2024", undefined, "2024-02-28T06:00Z");
  assert.equal(abuDhabi.localDate, "2024-02-28");
  assert.equal(abuDhabi.endDate, "2024-03-01");
  const lords = parseCricketLocalDates("2nd Test, Australia tour of England at London, Jun 28-Jul 2 2023", null, "2023-06-28T10:00Z");
  assert.equal(lords.endDate, "2023-07-02");
});

test("matchdays notes are read when the description carries no date, in each wording ESPN uses", () => {
  const noDate = "4th Test, England tour of Australia at Melbourne";
  const cases: [string, string, string | null][] = [
    ["26,27 December 2025 (5-day match)", "2025-12-26", "2025-12-27"],
    ["28,29,30 June, 1,2 July 2023 (5-day match)", "2023-06-28", "2023-07-02"],
    ["29 February 1,2,3 March 2024 (5-day match)", "2024-02-29", "2024-03-03"],
    ["28,29 February, 1, March 2024 (5-day match)", "2024-02-28", "2024-03-01"],
    ["3,4,5 January 2025 (5-day match)", "2025-01-03", "2025-01-05"],
    // SYNTHETIC wordings
    ["26-30 December 2025", "2025-12-26", "2025-12-30"],
    ["29 Nov-3 Dec 2025", "2025-11-29", "2025-12-03"],
    ["30,31 December, 1,2,3 January 2022 (5-day match)", "2021-12-30", "2022-01-03"],
    ["7 March 2024", "2024-03-07", null],
  ];
  for (const [text, first, last] of cases) {
    const r = parseCricketLocalDates(noDate, note(text), "2000-01-01T00:00Z");
    assert.deepEqual([r.localDate, r.endDate, r.source], [first, last, "notes"], text);
  }
});

test("a range across New Year is read across the year in a description too", () => {
  // SYNTHETIC: year written on both ends, and once at the end
  const both = parseCricketLocalDates("1st Test, X tour of Y at Z, Dec 30 2021-Jan 3 2022", null, "2021-12-29T20:00Z");
  assert.deepEqual([both.localDate, both.endDate], ["2021-12-30", "2022-01-03"]);
  const once = parseCricketLocalDates("1st Test, X tour of Y at Z, Dec 30-Jan 3 2022", null, "2021-12-29T20:00Z");
  assert.deepEqual([once.localDate, once.endDate], ["2021-12-30", "2022-01-03"]);
});

test("a T20 morning game at 23:00 UTC is the next local day, with no end date", () => {
  const r = parseCricketLocalDates("39th Match, Women's Big Bash League at Melbourne, Nov 24 2024", [], "2024-11-23T23:00Z");
  assert.deepEqual(r, { localDate: "2024-11-24", endDate: null, source: "description" });
});

test("a night game in the Americas is not moved to the UTC tomorrow", () => {
  const r = parseCricketLocalDates("3rd T20I, Sri Lanka tour of West Indies at Bridgetown, Jul 3 2026", null, "2026-07-04T00:00Z");
  assert.equal(r.localDate, "2026-07-03");
});

test("a description with no date falls back to the UTC day of the start", () => {
  const r = parseCricketLocalDates("Final, Women's Big Bash League at Hobart", [], "2024-11-30T04:00Z");
  assert.deepEqual(r, { localDate: "2024-11-30", endDate: null, source: "utc" });
  // a numbered series name is not a date
  assert.equal(parseCricketLocalDates("2nd Match, Group 2, ICC T20 World Cup at Dubai", null, "2021-10-24T14:00Z").source, "utc");
});

test("a game with no description and no notes falls back too, and a note that is not matchdays is ignored", () => {
  assert.deepEqual(parseCricketLocalDates(undefined, undefined, "2025-03-04T09:30:00Z"), { localDate: "2025-03-04", endDate: null, source: "utc" });
  assert.equal(parseCricketLocalDates(null, [{ type: "toss", text: "England, elected to field first 26 December" }], "2025-03-04T09:30:00Z").source, "utc");
});

test("an impossible date is not trusted", () => {
  assert.equal(parseCricketLocalDates("Match, X at Y, Feb 30 2024", null, "2024-03-01T10:00Z").source, "utc");
  // last day before the first: keep the first only
  const r = parseCricketLocalDates("Test, X at Y, Dec 30-Dec 3 2024", null, "2024-12-30T10:00Z");
  assert.equal(r.localDate, "2024-12-30");
  assert.equal(r.endDate, null);
});
