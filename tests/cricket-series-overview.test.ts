import { test } from "node:test";
import assert from "node:assert/strict";
import { cricketSeriesOverview, seriesVenues } from "../src/lib/cricketSeriesOverview";

// Search Console, 2026-10-06: Google re-crawls a series page about weekly, so for the first days of a competition it
// serves the version it saw before the first ball. That version was a title and a fixture list. The overview gives it
// the facts people search for before a tournament: who plays, how many matches of which format, when, and where.

const teams = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `Team ${i + 1}` }));

test("cricketSeriesOverview: a league names its team count, matches, format, dates and venues", () => {
  assert.equal(
    cricketSeriesOverview({ teams: teams(8), formats: ["Other OD"], startDate: "2026-10-03T08:00:00Z", endDate: "2026-12-22T08:00:00Z", matchCount: 56, venues: ["A", "B", "C", "D", "E", "F"] }),
    "8 teams play 56 one-day matches from Oct 3 to Dec 22, 2026 across 6 venues."
  );
});

test("cricketSeriesOverview: a bilateral series names both teams, a lone venue by name, and both years when it spans the new year", () => {
  assert.equal(
    cricketSeriesOverview({ teams: [{ name: "Afghanistan" }, { name: "Bangladesh" }], formats: ["Test", "T20I"], startDate: "2026-10-09T06:00:00Z", endDate: "2026-10-20T14:00:00Z", matchCount: 4, venues: ["Sharjah Cricket Stadium"] }),
    "Afghanistan and Bangladesh play 4 Test and T20I matches from Oct 9 to Oct 20, 2026 at Sharjah Cricket Stadium."
  );
  assert.equal(
    cricketSeriesOverview({ teams: teams(3), formats: ["Youth T20"], startDate: "2026-12-28T08:00:00Z", endDate: "2027-01-05T08:00:00Z", matchCount: 7, venues: [] }),
    "3 teams play 7 youth T20 matches from Dec 28, 2026 to Jan 5, 2027."
  );
});

test("cricketSeriesOverview: a one-day series says 'on', a single match is singular, and nothing is said without teams or dates", () => {
  assert.equal(
    cricketSeriesOverview({ teams: [{ name: "India" }, { name: "Australia" }], formats: ["ODI"], startDate: "2026-10-09T06:00:00Z", endDate: "2026-10-09T06:00:00Z", matchCount: 1, venues: [] }),
    "India and Australia play 1 ODI match on Oct 9, 2026."
  );
  // A Test or first-class match lasts days, so a lone one starts on its date rather than happening on it.
  assert.equal(
    cricketSeriesOverview({ teams: [{ name: "Afghanistan" }, { name: "Bangladesh" }], formats: ["Test"], startDate: "2026-10-09T06:00:00Z", endDate: "2026-10-09T06:00:00Z", matchCount: 1, venues: ["Zayed Cricket Stadium, Abu Dhabi"] }),
    "Afghanistan and Bangladesh play 1 Test match starting Oct 9, 2026 at Zayed Cricket Stadium, Abu Dhabi."
  );
  // The catch-all class card says nothing about the format.
  assert.equal(cricketSeriesOverview({ teams: teams(4), formats: ["Other match"], startDate: "2026-10-09T06:00:00Z", endDate: "2026-10-12T06:00:00Z", matchCount: 6, venues: [] }), "4 teams play 6 matches from Oct 9 to Oct 12, 2026.");
  assert.equal(cricketSeriesOverview({ teams: [], formats: ["ODI"], startDate: "2026-10-09T06:00:00Z", endDate: null, matchCount: 3, venues: [] }), null);
  assert.equal(cricketSeriesOverview({ teams: teams(2), formats: ["ODI"], startDate: null, endDate: null, matchCount: 3, venues: [] }), null);
  assert.equal(cricketSeriesOverview({ teams: teams(2), formats: ["ODI"], startDate: "2026-10-09T06:00:00Z", endDate: "2026-10-12T06:00:00Z", matchCount: 0, venues: [] }), null);
});

test("seriesVenues: the distinct venues of a match list in first-appearance order, blanks dropped", () => {
  assert.deepEqual(seriesVenues([{ venue: "Wanderers" }, { venue: null }, { venue: "Kingsmead" }, { venue: "Wanderers" }, { venue: " " }]), ["Wanderers", "Kingsmead"]);
  assert.deepEqual(seriesVenues([]), []);
});
