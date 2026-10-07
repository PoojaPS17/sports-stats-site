import { test } from "node:test";
import assert from "node:assert/strict";
import { teamClaims } from "../src/lib/heroClaims";
import { seasonResults } from "../src/lib/teamSummary";

const now = new Date("2026-10-08T12:00:00Z");
const recent = new Date("2026-10-06T12:00:00Z");
const us = { soccer: false, lastPlayed: recent, now };
const fc = { soccer: true, lastPlayed: recent, now };

test("a win streak of three or more is claimed, a shorter one is not", () => {
  assert.deepEqual(teamClaims(["W", "W", "W", "L", "W"], us), ["3 straight wins"]);
  assert.deepEqual(teamClaims(["W", "W", "L", "W", "W"], us), []);
  assert.deepEqual(teamClaims([], us), []);
});

test("a run that fills the whole season is worded as the season's, not as a streak", () => {
  assert.deepEqual(teamClaims(["W", "W", "W", "W"], us), ["Won all 4 games this season"]);
});

test("football also claims an unbeaten run of five, but only when it says more than the wins", () => {
  assert.deepEqual(teamClaims(["W", "D", "W", "W", "D", "L"], fc), ["Unbeaten in 5"]);
  assert.deepEqual(teamClaims(["W", "W", "W", "W", "W", "L"], fc), ["5 straight wins"]);
  assert.deepEqual(teamClaims(["D", "D", "W", "D"], fc), []);
  assert.deepEqual(teamClaims(["W", "W", "D", "D", "W"], fc), ["Unbeaten in 5 games this season"]);
  assert.deepEqual(teamClaims(["W", "D", "W", "D", "W", "L"], us), []);
});

test("nothing is claimed once the last result is stale or missing", () => {
  const old = new Date("2026-09-01T12:00:00Z");
  assert.deepEqual(teamClaims(["W", "W", "W", "W"], { soccer: false, lastPlayed: old, now }), []);
  assert.deepEqual(teamClaims(["W", "W", "W", "W"], { soccer: false, lastPlayed: null, now }), []);
  assert.deepEqual(teamClaims(["W", "W", "W", "W"], { soccer: false, lastPlayed: new Date("2026-09-20T12:00:00Z"), now }), ["Won all 4 games this season"]);
});

test("season results skip excluded games and games with no result", () => {
  const g = (id: string, over: object) => ({ espn_id: id, completed: true, stage: null, home_team_espn_id: "1", away_team_espn_id: "2", home_winner: true, away_winner: false, home_score: 2, away_score: 1, status_summary: "Final", status_detail: "Final", ...over }) as never;
  const games = [g("a", {}), g("b", { stage: "excluded" }), g("c", { home_winner: null, away_winner: null, status_summary: "No result", home_score: null, away_score: null }), g("d", { home_winner: false, away_winner: true })];
  assert.deepEqual(seasonResults(games, "1"), ["W", "L"]);
});
