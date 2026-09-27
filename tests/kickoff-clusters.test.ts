// A day's games cluster into "kicked off together" runs when 2+ adjacent upcoming games share the exact
// same raw UTC instant (game.date) -- so a page can label a shared broadcast window (the NFL's 1pm ET
// slate showing nine games at once) instead of repeating an unexplained identical clock time on every
// card. Completed and live games never merge, whatever their date, since they show a status pill instead
// of a kickoff clock.
process.env.DATABASE_URL ??= "postgres://postgres:password@localhost:1/none";

import { test } from "node:test";
import assert from "node:assert/strict";
import { groupByKickoff } from "../src/lib/gameDisplay";
import type { GameRow } from "../src/lib/queries";

const game = (over: Partial<GameRow> = {}): GameRow =>
  ({
    league: "nfl", espn_id: "1", date: "2026-09-27T17:00:00Z", name: "x", short_name: null,
    home_score: null, away_score: null, home_score_display: null, away_score_display: null, home_winner: false, away_winner: false,
    season_year: 2026, status_state: "pre", status_detail: "Scheduled", status_summary: null, round: null, completed: false,
    home_team_espn_id: "1", away_team_espn_id: "2",
    home_name: "Home", home_slug: "home", home_abbr: "HOM", home_logo: null, home_color: null,
    away_name: "Away", away_slug: "away", away_abbr: "AWY", away_logo: null, away_color: null,
    ...over,
  }) as GameRow;

test("upcoming games sharing the exact same kickoff instant land in one cluster", () => {
  const games = [
    game({ espn_id: "1", date: "2026-09-27T17:00:00Z" }),
    game({ espn_id: "2", date: "2026-09-27T17:00:00Z" }),
    game({ espn_id: "3", date: "2026-09-27T17:00:00Z" }),
  ];
  const clusters = groupByKickoff(games);
  assert.equal(clusters.length, 1);
  assert.deepEqual(clusters[0].map((g) => g.espn_id), ["1", "2", "3"]);
});

test("clusters just as well when date arrives as a Date object, not a string -- pool.query()'s real shape", () => {
  // GameRow.date is typed as a string, but every row read straight from pool.query() (as the three
  // real call sites do) carries a native Date for a timestamptz column -- gameDay.ts's `string | Date`
  // parameters exist for exactly this reason. Two distinct Date instances for the same instant are
  // never `===`; this only passes when the comparison goes through getTime() instead.
  const sameInstant = new Date("2026-09-27T17:00:00Z");
  const games = [
    game({ espn_id: "1", date: new Date(sameInstant) as unknown as string }),
    game({ espn_id: "2", date: new Date(sameInstant) as unknown as string }),
    game({ espn_id: "3", date: new Date(sameInstant) as unknown as string }),
  ];
  const clusters = groupByKickoff(games);
  assert.equal(clusters.length, 1);
  assert.deepEqual(clusters[0].map((g) => g.espn_id), ["1", "2", "3"]);
});

test("games at different kickoff instants stay in their own clusters", () => {
  const games = [
    game({ espn_id: "1", date: "2026-09-27T17:00:00Z" }),
    game({ espn_id: "2", date: "2026-09-27T20:05:00Z" }),
    game({ espn_id: "3", date: "2026-09-27T20:25:00Z" }),
  ];
  const clusters = groupByKickoff(games);
  assert.equal(clusters.length, 3);
  assert.deepEqual(clusters.map((c) => c.length), [1, 1, 1]);
});

test("a lone game with no time-mate is its own cluster of one, whatever its date", () => {
  const clusters = groupByKickoff([game({ espn_id: "1" })]);
  assert.deepEqual(clusters, [[game({ espn_id: "1" })]]);
});

test("completed and live games never merge, even at an identical instant", () => {
  const sameInstant = "2026-09-27T17:00:00Z";
  const completed = game({ espn_id: "1", date: sameInstant, completed: true, status_state: "post", status_detail: "Final" });
  const live = game({ espn_id: "2", date: sameInstant, completed: false, status_state: "in", status_detail: "In Progress" });
  const upcoming = game({ espn_id: "3", date: sameInstant });
  const clusters = groupByKickoff([completed, live, upcoming]);
  assert.deepEqual(clusters.map((c) => c.map((g) => g.espn_id)), [["1"], ["2"], ["3"]]);
});

test("a called-off game never merges either, even sharing an upcoming neighbor's instant", () => {
  const sameInstant = "2026-09-27T17:00:00Z";
  const calledOff = game({ espn_id: "1", date: sameInstant, completed: false, status_state: "post", status_detail: "Postponed" });
  const upcoming = game({ espn_id: "2", date: sameInstant });
  const clusters = groupByKickoff([calledOff, upcoming]);
  assert.deepEqual(clusters.map((c) => c.map((g) => g.espn_id)), [["1"], ["2"]]);
});

test("a mixed day only clusters the consecutive upcoming run, and preserves order", () => {
  const games = [
    game({ espn_id: "1", date: "2026-09-27T13:00:00Z", completed: true, status_state: "post", status_detail: "Final" }),
    game({ espn_id: "2", date: "2026-09-27T17:00:00Z" }),
    game({ espn_id: "3", date: "2026-09-27T17:00:00Z" }),
    game({ espn_id: "4", date: "2026-09-27T20:25:00Z" }),
  ];
  const clusters = groupByKickoff(games);
  assert.deepEqual(clusters.map((c) => c.map((g) => g.espn_id)), [["1"], ["2", "3"], ["4"]]);
});

test("an empty day is an empty list of clusters", () => {
  assert.deepEqual(groupByKickoff([]), []);
});
