import { test } from "node:test";
import assert from "node:assert/strict";
import { breakLine } from "../src/lib/breakLine";

// The homepage's quiet-league line. A league with a fixture still to come is on a break, not
// between seasons: the Premier League's September-October international break showed "The
// Premier League is between seasons" for three weeks in 2026.
test("a league with a fixture ahead resumes on that day", () => {
  assert.equal(breakLine("epl", "2026-10-10T14:00:00.000Z"), "The Premier League resumes Saturday, Oct 10");
});

test("a league with no fixture ahead is between seasons", () => {
  assert.equal(breakLine("laliga", null), "La Liga is between seasons");
});

test("the day is the league's own day: an NBA tip-off after midnight UTC is still the evening before in the East", () => {
  assert.equal(breakLine("nba", "2026-10-21T02:00:00.000Z"), "The NBA resumes Tuesday, Oct 20");
});
