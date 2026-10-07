import { test } from "node:test";
import assert from "node:assert/strict";
import { playerClaims } from "../src/lib/playerClaims";
import type { PlayerLogRow } from "../src/lib/playerProfile";

const now = new Date("2026-10-08T12:00:00Z");

// Newest first, like the profile's rows: the figure is the row's `stats.v.n` (a stand-in for the lead stat).
function rows(values: (number | null)[], opts: { season?: number; daysAgo?: number; noBox?: number[] } = {}): PlayerLogRow[] {
  return values.map((v, i) => ({ date: new Date(now.getTime() - ((opts.daysAgo ?? 1) + i * 2) * 86_400_000).toISOString(), season_year: opts.season ?? 2026, no_box_score: opts.noBox?.includes(i) || undefined, stats: { v: { n: v === null ? "--" : String(v) } } }) as unknown as PlayerLogRow);
}
const form = (label: string) => ({ label, value: (r: PlayerLogRow) => (r.stats.v.n === "--" ? null : Number(r.stats.v.n)) });

test("a latest game above every earlier figure this season is a season high", () => {
  assert.deepEqual(playerClaims(rows([41, 22, 18, 30, 25, 12, 8]), form("Points"), "nba", { now }), ["Season high 41 points"]);
  assert.deepEqual(playerClaims(rows([30, 22, 18, 30, 25, 12, 8]), form("Points"), "nba", { now }), []);
});

test("a season high needs five earlier games, and a figure above zero", () => {
  assert.deepEqual(playerClaims(rows([41, 22, 18, 30]), form("Points"), "nba", { now }), []);
  assert.deepEqual(playerClaims(rows([0, 0, 0, 0, 0, 0], {}), form("Points"), "nba", { now }), []);
});

test("a rate or mixed figure never gets a season high", () => {
  assert.deepEqual(playerClaims(rows([60, 40, 40, 40, 40, 40]), form("Yards per punt"), "nfl", { now }), []);
  assert.deepEqual(playerClaims(rows([3, 1, 1, 0, 1, 1]), form("Goals + assists"), "soccer", { now }), ["Goal or assist in 3 straight games"]);
});

test("an earlier season's games do not count toward this season's high", () => {
  const r = [...rows([25, 20, 18], { season: 2026 }), ...rows([40, 38, 36, 35], { season: 2025, daysAgo: 400 })];
  assert.deepEqual(playerClaims(r, form("Points"), "nba", { now }), []);
});

test("twenty points in five straight games is claimed, a break ends it", () => {
  assert.deepEqual(playerClaims(rows([22, 25, 31, 20, 24, 11, 30, 28]), form("Points"), "nba", { now }), ["20+ points in 5 straight games"]);
  assert.deepEqual(playerClaims(rows([22, 25, 31, 19, 24, 24, 24]), form("Points"), "nba", { now }), []);
  assert.deepEqual(playerClaims(rows([22, 25, 31, 20, 24]), form("Points"), "nba", { now }), ["20+ points in all 5 games"]);
});

test("a game with no figure ends a run instead of passing through it", () => {
  assert.deepEqual(playerClaims(rows([22, 25, null, 20, 24, 28, 30]), form("Points"), "nba", { now }), []);
});

test("football claims a run of games with a goal or an assist", () => {
  assert.deepEqual(playerClaims(rows([1, 2, 1, 0, 1]), form("Goals + assists"), "soccer", { now }), ["Goal or assist in 3 straight games"]);
  assert.deepEqual(playerClaims(rows([1, 1]), form("Goals + assists"), "soccer", { now }), []);
  assert.deepEqual(playerClaims(rows([1, 1, 2]), form("Goals + assists"), "soccer", { now }), ["Goal or assist in all 3 games"]);
});

test("a game with no box score ends a run and cannot be a season high", () => {
  assert.deepEqual(playerClaims(rows([0, 25, 25, 25, 25, 25], { noBox: [0] }), form("Points"), "nba", { now }), []);
  assert.deepEqual(playerClaims(rows([25, 25, 0, 25, 25, 25, 25], { noBox: [2] }), form("Points"), "nba", { now }), []);
  assert.deepEqual(playerClaims(rows([25, 25, 25, 25, 25, 25, 0], { noBox: [6] }), form("Points"), "nba", { now }), ["20+ points in 6 straight games"]);
});

test("nothing is claimed once the last game is stale or there are no games", () => {
  assert.deepEqual(playerClaims(rows([41, 22, 18, 30, 25, 12, 8], { daysAgo: 30 }), form("Points"), "nba", { now }), []);
  assert.deepEqual(playerClaims([], form("Points"), "nba", { now }), []);
});
