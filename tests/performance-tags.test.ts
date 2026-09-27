// tests/performance-tags.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { performanceTags } from "../src/lib/performanceTags";
import type { PlayerLogRow, Stats } from "../src/lib/playerProfile";

function nbaRow(overrides: Partial<PlayerLogRow> = {}): PlayerLogRow {
  const stats: Stats = { box: { MIN: "36", PTS: "34", REB: "11", AST: "9", STL: "2", BLK: "1", TO: "3", FG: "12-19", "3PT": "3-7", FT: "7-8", "+/-": "-4" } };
  return {
    game_espn_id: "g1", date: "2026-01-15T00:00:00.000Z", season_year: 2025, round: null, week: null,
    stage: "regular", season_type: 2, competition_type: "STD", is_home: true,
    team_espn_id: "1", team_name: "Lakers", team_slug: "lakers", team_abbr: "LAL", team_logo: null,
    opponent_espn_id: "2", opponent_name: "Celtics", opponent_slug: "celtics", opponent_abbr: "BOS", opponent_logo: null,
    team_score: 110, opponent_score: 108, result: "W", stats, ...overrides,
  };
}

function nflRow(overrides: Partial<PlayerLogRow> = {}): PlayerLogRow {
  const stats: Stats = { passing: { "C/ATT": "24/35", YDS: "312", TD: "3", INT: "1", RTG: "108.2" } };
  return {
    game_espn_id: "g1", date: "2026-01-15T00:00:00.000Z", season_year: 2025, round: null, week: 10,
    stage: "regular", season_type: 2, competition_type: "STD", is_home: true,
    team_espn_id: "1", team_name: "Chiefs", team_slug: "chiefs", team_abbr: "KC", team_logo: null,
    opponent_espn_id: "2", opponent_name: "Bills", opponent_slug: "bills", opponent_abbr: "BUF", opponent_logo: null,
    team_score: 27, opponent_score: 20, result: "W", stats, ...overrides,
  };
}

test("NBA: a season-high points game (strictly above every prior game this season) gets one tag naming the stat", () => {
  const prior = Array.from({ length: 5 }, () => nbaRow({ game_espn_id: "prior", stats: { box: { MIN: "30", PTS: "26", REB: "8", AST: "6", STL: "1", BLK: "1", TO: "2", FG: "9-18", "3PT": "2-6", FT: "6-7", "+/-": "+1" } } }));
  const tags = performanceTags(nbaRow(), prior, "nba", true);
  assert.ok(tags.includes("Season high · PTS"));
});

test("NBA: exactly tying the prior max is NOT a season high (must be strictly higher)", () => {
  const prior = [nbaRow({ game_espn_id: "prior" })]; // same 34 PTS
  const tags = performanceTags(nbaRow(), prior, "nba", true);
  assert.ok(!tags.includes("Season high · PTS"));
});

test("NBA: a big night can earn multiple Season high tags at once", () => {
  const prior = Array.from({ length: 3 }, () => nbaRow({ game_espn_id: "prior", stats: { box: { MIN: "28", PTS: "20", REB: "5", AST: "4", STL: "1", BLK: "0", TO: "2", FG: "8-15", "3PT": "1-4", FT: "3-4", "+/-": "+2" } } }));
  const tags = performanceTags(nbaRow(), prior, "nba", true); // 34 PTS, 11 REB, 9 AST, 2 STL, 1 BLK, all above prior
  assert.ok(tags.includes("Season high · PTS"));
  assert.ok(tags.includes("Season high · REB"));
  assert.ok(tags.includes("Season high · AST"));
  assert.ok(tags.includes("Season high · STL"));
});

test("NBA: FG% (a rate stat) and +/- never get a Season high tag, even when both are this season's best", () => {
  const prior = [nbaRow({ game_espn_id: "prior", stats: { box: { MIN: "20", PTS: "10", REB: "3", AST: "2", STL: "0", BLK: "0", TO: "1", FG: "2-10", "3PT": "0-2", FT: "0-0", "+/-": "-10" } } })];
  const tags = performanceTags(nbaRow(), prior, "nba", true); // this row's FG% and +/- both beat the prior game's
  assert.ok(!tags.some((t) => t.includes("FG%")));
  assert.ok(!tags.some((t) => t.includes("+/-")));
});

test("an incomplete season (a game missing a box score) suppresses every Season high tag, even a real one", () => {
  const prior = [nbaRow({ game_espn_id: "prior", stats: { box: { MIN: "10", PTS: "2", REB: "1", AST: "0", STL: "0", BLK: "0", TO: "0", FG: "1-3", "3PT": "0-0", FT: "0-0", "+/-": "-5" } } })];
  const tags = performanceTags(nbaRow(), prior, "nba", false); // seasonComplete: false
  assert.equal(tags.filter((t) => t.startsWith("Season high")).length, 0);
});

test("NFL: interceptions THROWN (pass_int) never gets a Season high tag; interceptions MADE (int) can", () => {
  const prior = [nflRow({ game_espn_id: "prior", stats: { passing: { "C/ATT": "18/30", YDS: "200", TD: "1", INT: "0", RTG: "90.0" } } })];
  const thisGame = nflRow({ stats: { passing: { "C/ATT": "24/35", YDS: "312", TD: "3", INT: "2", RTG: "108.2" } } }); // 2 INTs thrown, a season high in INTs if it counted
  const tags = performanceTags(thisGame, prior, "nfl", true);
  assert.ok(!tags.some((t) => t.toLowerCase().includes("int")), `pass_int must never tag, got: ${tags.join(", ")}`);

  const defRow = nflRow({ team_name: "Jets", stats: { interceptions: { INT: "2" } } });
  const priorDef = [nflRow({ game_espn_id: "prior", stats: { interceptions: { INT: "0" } } })];
  const defTags = performanceTags(defRow, priorDef, "nfl", true);
  assert.ok(defTags.includes("Season high · INT"), `defensive int must tag, got: ${defTags.join(", ")}`);
});

test("NBA: a triple-double (>= 10 in at least 3 of PTS/REB/AST/STL/BLK) is tagged", () => {
  const row = nbaRow({ stats: { box: { MIN: "38", PTS: "22", REB: "11", AST: "10", STL: "1", BLK: "0", TO: "4", FG: "9-20", "3PT": "1-5", FT: "3-4", "+/-": "+2" } } });
  const tags = performanceTags(row, [], "nba", true);
  assert.ok(tags.includes("Triple-double"));
});

test("NBA: exactly 2 of 5 at or above 10 is NOT a triple-double", () => {
  const row = nbaRow({ stats: { box: { MIN: "30", PTS: "8", REB: "10", AST: "10", STL: "1", BLK: "0", TO: "3", FG: "3-8", "3PT": "0-1", FT: "2-2", "+/-": "0" } } });
  const tags = performanceTags(row, [], "nba", true);
  assert.ok(!tags.includes("Triple-double"));
});

test("NBA: a null category (an old blank-box-score row) can't be coerced to 0 to help OR to block a triple-double", () => {
  // The stored Stats type is Record<string, Record<string, string>>, but cell() defensively
  // handles a null cell too (a real quirk of some old rows) — cast to exercise that at runtime.
  const stats = { box: { MIN: null, PTS: "12", REB: "10", AST: "10", STL: null, BLK: null, TO: null, FG: null, "3PT": null, FT: null, "+/-": null } } as unknown as Stats;
  const row = nbaRow({ stats });
  const tags = performanceTags(row, [], "nba", true);
  // 3 of 5 (PTS, REB, AST) are confirmed >= 10; STL/BLK being null must not block it.
  assert.ok(tags.includes("Triple-double"));
});

test("triple-double is NBA only: an NFL row is never checked for it", () => {
  const tags = performanceTags(nflRow(), [], "nfl", true);
  assert.ok(!tags.includes("Triple-double"));
});
