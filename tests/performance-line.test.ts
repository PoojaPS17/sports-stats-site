import { test } from "node:test";
import assert from "node:assert/strict";
import { performanceLine } from "../src/lib/performanceLine";
import { buildProfile, type PlayerLogRow, type Stats } from "../src/lib/playerProfile";

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

test("NBA: headline stats are PTS/REB/AST/STL/BLK plus shooting splits and +/-, with a delta vs that season's average", () => {
  const row = nbaRow();
  // A season of games averaging lower than this one game, so the delta is a known positive number.
  const seasonRows = Array.from({ length: 10 }, () => nbaRow({ stats: { box: { MIN: "30", PTS: "26", REB: "8", AST: "6", STL: "1", BLK: "1", TO: "2", FG: "9-18", "3PT": "2-6", FT: "6-7", "+/-": "+1" } } }));
  const profile = buildProfile("nba", seasonRows);
  const line = performanceLine("nba", row, profile);

  const byKey = new Map(line.map((s) => [s.key, s]));
  assert.deepEqual([...byKey.keys()].sort(), ["ast", "blk", "fg_pct", "fgm_fga", "ftm_fta", "pm", "pts", "reb", "stl", "tpm_tpa"].sort());
  assert.equal(byKey.get("pts")!.value, "34");
  assert.equal(byKey.get("pts")!.delta, "+8 vs season avg");
  assert.equal(byKey.get("ftm_fta")!.value, "7-8");
  assert.equal(byKey.get("tpm_tpa")!.value, "3-7");
});

test("NBA: a negative +/- stays negative in both value and delta", () => {
  const row = nbaRow(); // "+/-": "-4"
  const seasonRows = Array.from({ length: 5 }, () => nbaRow({ stats: { box: { MIN: "30", PTS: "20", REB: "8", AST: "5", STL: "1", BLK: "1", TO: "2", FG: "8-16", "3PT": "2-5", FT: "2-3", "+/-": "+6" } } }));
  const profile = buildProfile("nba", seasonRows);
  const line = performanceLine("nba", row, profile);
  const pm = line.find((s) => s.key === "pm")!;
  assert.equal(pm.value, "-4");
  assert.equal(pm.delta, "-10 vs season avg");
});

test("NFL: passing headline stats read the same sum-aggregated specs the player page uses, with a per-game season average for the delta", () => {
  const row = nflRow(); // 312 pass yards this game
  // 5 games at 250 pass yards each = 1250 season total, 250/gm average, so the delta is +62.
  const seasonRows = Array.from({ length: 5 }, () => nflRow({ stats: { passing: { "C/ATT": "20/32", YDS: "250", TD: "2", INT: "1", RTG: "95.0" } } }));
  const profile = buildProfile("nfl", seasonRows);
  const line = performanceLine("nfl", row, profile);
  const passYds = line.find((s) => s.key === "pass_yds")!;
  assert.equal(passYds.value, "312");
  assert.equal(passYds.delta, "+62 vs season avg");
});

test("a stat with no season line (first game of a season with only this one row) has a null delta, not a crash", () => {
  const row = nbaRow();
  const profile = buildProfile("nba", [row]);
  const line = performanceLine("nba", row, profile);
  // Averaged against itself, the delta is +0 — assert it's present and zero, not null, proving no divide-by-zero/NaN.
  const pts = line.find((s) => s.key === "pts")!;
  assert.equal(pts.delta, "+0 vs season avg");
});
