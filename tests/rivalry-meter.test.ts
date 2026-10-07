import { test } from "node:test";
import assert from "node:assert/strict";
import { rivalryMeter, streakText } from "../src/lib/rivalry";

const A = { espn_id: "1", name: "Alpha", slug: "alpha", abbreviation: null, logo_url: null, color: null };
const B = { espn_id: "2", name: "Beta", slug: "beta", abbreviation: null, logo_url: null, color: null };
const game = (aHome: boolean, a: number, b: number) =>
  ({ completed: true, stage: null, home_team_espn_id: aHome ? "1" : "2", away_team_espn_id: aHome ? "2" : "1", home_score: aHome ? a : b, away_score: aHome ? b : a }) as never;
const h2h = (winsA: number, winsB: number, games: unknown[] = []) => ({ teamA: A, teamB: B, winsA, winsB, meetings: winsA + winsB, games: games as never[] });
const name = (t: { name: string }) => t.name;

test("a close record is neck and neck, a lopsided one names the leader", () => {
  assert.equal(rivalryMeter(h2h(10, 9), name).label, "Neck and neck");
  assert.equal(rivalryMeter(h2h(12, 8), name).label, "Slight edge to Alpha");
  assert.equal(rivalryMeter(h2h(6, 14), name).label, "Clear edge to Beta");
  assert.equal(rivalryMeter(h2h(18, 2), name).label, "One-sided");
});

test("too few meetings give no label", () => {
  assert.equal(rivalryMeter(h2h(3, 1), name).label, null);
  assert.equal(rivalryMeter(h2h(0, 0), name).label, null);
});

test("draws do not dilute closeness", () => {
  const m = { ...h2h(10, 10), meetings: 40 };
  assert.equal(rivalryMeter(m, name).label, "Neck and neck");
});

test("the last five are read from the first team's side, home or away", () => {
  const games = [game(true, 2, 1), game(false, 0, 3), game(true, 1, 1), game(false, 2, 0), game(true, 0, 1), game(true, 9, 0)];
  assert.deepEqual(rivalryMeter(h2h(2, 2, games), name).last5, ["A", "B", "D", "A", "B"]);
});

test("excluded stages and unplayed games are not in the last five", () => {
  const excluded = { ...(game(true, 5, 0) as object), stage: "excluded" } as never;
  const unplayed = { ...(game(true, 5, 0) as object), completed: false } as never;
  assert.deepEqual(rivalryMeter(h2h(1, 0, [excluded, unplayed, game(true, 1, 0)]), name).last5, ["A"]);
});

test("a run of two or more is worded for the team that holds it", () => {
  const base = { teamA: A, teamB: B };
  assert.equal(streakText({ ...base, streak: { team: "A", length: 4 } }, name), "Alpha have won the last 4");
  assert.equal(streakText({ ...base, streak: { team: "B", length: 2 } }, name), "Beta have won the last 2");
  assert.equal(streakText({ ...base, streak: { team: null, length: 3 } }, name), "The last 3 meetings were drawn");
  assert.equal(streakText({ ...base, streak: { team: "A", length: 1 } }, name), null);
  assert.equal(streakText({ ...base, streak: null }, name), null);
});
