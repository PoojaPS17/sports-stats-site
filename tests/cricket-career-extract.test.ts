// What the ESPN extractor keeps per player. ESPN lists the XI on every roster, with a starter or subbedIn
// flag; Cricinfo's Matches counts each of them, so a player who neither batted, bowled nor caught still
// has a card row (with no figures), and someone in neither group does not.
import { test } from "node:test";
import assert from "node:assert/strict";
import { CARD_VERSION, extractCricketMatchStats } from "../scripts/lib/cricket-career";

const linescore = (period: number, stats: Record<string, number>) => ({
  period,
  statistics: { categories: [{ stats: Object.entries(stats).map(([name, value]) => ({ name, value, displayValue: String(value) })) }] },
});
const entry = (id: string, flags: { starter?: boolean; subbedIn?: boolean }, linescores: unknown[] = []) => ({
  athlete: { id, displayName: `Player ${id}` },
  ...flags,
  linescores,
});

function summary(home: unknown[], away: unknown[] = []) {
  return {
    header: { competitions: [{ class: { generalClassCard: "T20" } }] },
    rosters: [
      { team: { id: "1" }, roster: home },
      { team: { id: "2" }, roster: away },
    ],
  };
}

const byId = (s: unknown) => new Map(extractCricketMatchStats(s).players.map((p) => [p.athleteId, p]));

test("a starter with no figures is a row with no batting, bowling or catches", () => {
  const players = byId(summary([entry("10", { starter: true }), entry("11", { starter: true }, [linescore(1, { batted: 1, ballsFaced: 5, runs: 7, notouts: 1 })])]));
  const idle = players.get("10");
  assert.ok(idle, "in the XI, so a match played");
  assert.equal(idle.teamId, "1");
  assert.equal(idle.batting, undefined);
  assert.equal(idle.bowling, undefined);
  assert.equal(idle.catches, undefined);
  assert.equal(idle.innings, undefined);
  assert.equal(JSON.stringify({ batting: idle.batting, bowling: idle.bowling, catches: idle.catches, innings: idle.innings }), "{}");
  assert.equal(players.get("11")?.batting?.runs, 7);
});

test("a substitute who came on with no figures is a row too", () => {
  const players = byId(summary([entry("10", { starter: false, subbedIn: true }), entry("11", { starter: true }, [linescore(1, { batted: 1, runs: 1 })])]));
  assert.ok(players.has("10"));
});

test("a player in neither group with no figures is not a row", () => {
  const players = byId(summary([entry("10", { starter: false, subbedIn: false }), entry("11", {}), entry("12", { starter: true }, [linescore(1, { batted: 1, runs: 1 })])]));
  assert.equal(players.has("10"), false);
  assert.equal(players.has("11"), false);
  assert.equal(players.has("12"), true);
});

test("a player in neither group who took a catch is still a row", () => {
  const players = byId(summary([entry("10", { starter: false, subbedIn: false }, [linescore(2, { caught: 1, caughtFielder: 1 })]), entry("11", { starter: true })]));
  assert.equal(players.get("10")?.catches, 1);
});

test("catches and stumpings still count exactly once each", () => {
  const players = byId(
    summary([
      // `caught` is the total of the fielder and keeper kinds, not a third kind of catch.
      entry("10", { starter: true }, [linescore(2, { caught: 2, caughtFielder: 0, caughtKeeper: 2, stumped: 1 })]),
      entry("11", { starter: true }, [linescore(2, { caughtFielder: 2, caughtKeeper: 1 })]),
      entry("12", { starter: true }, [linescore(2, { stumped: 2 })]),
    ])
  );
  assert.equal(players.get("10")?.catches, 3);
  assert.equal(players.get("11")?.catches, 3);
  assert.equal(players.get("12")?.catches, 2);
});

test("a match with no figures at all has no rows, so a washed-out game is not counted", () => {
  assert.equal(extractCricketMatchStats(summary([entry("10", { starter: true })], [entry("20", { starter: true })])).players.length, 0);
});

test("the card version marks rows that store appearances with no figures", () => {
  assert.equal(CARD_VERSION, 3);
});
