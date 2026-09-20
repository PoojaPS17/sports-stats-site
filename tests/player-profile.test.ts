// How a box-score cell is read, and what that does to a season's totals when a game is negative.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildProfile, buildStagedProfile, cell, sportProfile, type PlayerLogRow, type Stats } from "../src/lib/playerProfile";

const one = (category: string, label: string, value: string | undefined): Stats => ({ [category]: value === undefined ? {} : { [label]: value } });

test("cell keeps the sign of a negative number", () => {
  assert.equal(cell(one("box", "+/-", "-3"), "box", "+/-"), -3);
  assert.equal(cell(one("box", "+/-", "-12"), "box", "+/-"), -12);
  assert.equal(cell(one("rushing", "YDS", "-1"), "rushing", "YDS"), -1);
  assert.equal(cell(one("box", "+/-", "+5"), "box", "+/-"), 5);
  assert.equal(cell(one("box", "+/-", "0"), "box", "+/-"), 0);
});

test("cell splits a made/attempted pair at the slash or the dash between two digits", () => {
  const made = one("box", "FG", "23/33");
  assert.equal(cell(made, "box", "FG", 0), 23);
  assert.equal(cell(made, "box", "FG", 1), 33);
  const dashed = one("box", "3PT", "3-11");
  assert.equal(cell(dashed, "box", "3PT", 0), 3);
  assert.equal(cell(dashed, "box", "3PT", 1), 11);
  assert.equal(cell(one("box", "FT", "0-0"), "box", "FT", 0), 0);
  assert.equal(cell(one("box", "FT", "0-0"), "box", "FT", 1), 0);
});

test("cell reads a missing, empty or dashed cell as null", () => {
  assert.equal(cell(one("box", "+/-", "--"), "box", "+/-"), null);
  assert.equal(cell(one("box", "+/-", ""), "box", "+/-"), null);
  assert.equal(cell(one("box", "+/-", undefined), "box", "+/-"), null);
  assert.equal(cell({}, "box", "+/-"), null);
});

function row(id: string, date: string, stats: Stats): PlayerLogRow {
  return {
    game_espn_id: id, date, season_year: 2025, round: null, week: null, stage: "regular", season_type: 2, competition_type: "STD",
    is_home: true, team_espn_id: "1", team_name: "Home", team_slug: "home", team_abbr: "HOM", team_logo: null,
    opponent_espn_id: "2", opponent_name: "Away", opponent_slug: "away", opponent_abbr: "AWY", opponent_logo: null,
    team_score: 100, opponent_score: 90, result: "W", stats,
  };
}

test("an NBA season's plus/minus average counts a negative game", () => {
  const box = (pm: string): Stats => ({ box: { MIN: "30", PTS: "20", "+/-": pm } });
  const profile = buildProfile("nba", [row("a", "2025-01-01", box("+10")), row("b", "2025-01-03", box("-12")), row("c", "2025-01-05", box("+5"))]);
  // (10 - 12 + 5) / 3 = 1; with the negative read as 0 it would be 5.
  assert.equal(profile.seasons[0].line.pm, 1);
  assert.equal(profile.career.pm, 1);
});

test("an NFL season's rushing yards include a negative game", () => {
  const rush = (yds: string): Stats => ({ rushing: { CAR: "3", YDS: yds, AVG: "0", TD: "0" } });
  const profile = buildProfile("nfl", [row("a", "2025-09-07", rush("100")), row("b", "2025-09-14", rush("-3")), row("c", "2025-09-21", rush("20"))]);
  // 100 - 3 + 20 = 117; with the negative read as 0 it would be 120.
  assert.equal(profile.seasons[0].line.rush_yds, 117);
});

// Real-shaped NBA lines. ESPN lists a stat line for everyone on the bench sheet; a coach's-decision DNP
// comes through with every cell "--" (the extractor already drops didNotPlay and empty lines).
const box = (cells: Record<string, string>): Stats => ({ box: cells });
const FULL = { MIN: "31", PTS: "12", REB: "4", AST: "3", "+/-": "+2" };
const SUB_MINUTE = { MIN: "0", PTS: "0", REB: "0", AST: "1", STL: "0", BLK: "0", TO: "0", FG: "0-0", "3PT": "0-0", FT: "0-0", "+/-": "+3" };
const BENCH_DNP = { MIN: "--", PTS: "--", REB: "--", AST: "--", STL: "--", BLK: "--", TO: "--", FG: "--", "3PT": "--", FT: "--", "+/-": "--" };

/** Played through the profile's rule and through the staged profile's regular-season game count. */
function nbaPlayed(stats: Stats): { rule: boolean; games: number } {
  const r = row("g", "2025-01-01", stats);
  return { rule: sportProfile("nba", [r]).played(r), games: buildStagedProfile("nba", [r]).regular.games };
}

test("NBA: a normal line counts as a game", () => {
  assert.deepEqual(nbaPlayed(box(FULL)), { rule: true, games: 1 });
});

test("NBA: a sub-minute appearance (MIN \"0\", other stats on the line) counts as a game, as ESPN does", () => {
  assert.deepEqual(nbaPlayed(box(SUB_MINUTE)), { rule: true, games: 1 });
});

test("NBA: a bench-sheet line with every stat dashed is not a game", () => {
  assert.deepEqual(nbaPlayed(box(BENCH_DNP)), { rule: false, games: 0 });
  // Dashed minutes with zeroed stats, and dashed minutes with an empty string, are not games either.
  assert.deepEqual(nbaPlayed(box({ MIN: "--", PTS: "0", REB: "0", AST: "0" })), { rule: false, games: 0 });
  assert.deepEqual(nbaPlayed(box({ MIN: "", PTS: "0" })), { rule: false, games: 0 });
});

test("NBA: points on the line make it a game even when the minutes cell is missing", () => {
  assert.deepEqual(nbaPlayed(box({ PTS: "5", REB: "1" })), { rule: true, games: 1 });
  assert.deepEqual(nbaPlayed(box({ MIN: "--", PTS: "5" })), { rule: true, games: 1 });
});

test("NBA: no box score or an empty one is not a game", () => {
  assert.deepEqual(nbaPlayed({}), { rule: false, games: 0 });
  assert.deepEqual(nbaPlayed({ box: {} }), { rule: false, games: 0 });
});

test("an NBA season's games and per-game line count a sub-minute appearance and skip a bench-sheet line", () => {
  const rows = [
    row("a", "2025-01-01", box(SUB_MINUTE)),
    row("b", "2025-01-03", box(BENCH_DNP)),
    row("c", "2025-01-05", box(FULL)),
  ];
  const s = buildStagedProfile("nba", rows);
  assert.equal(s.regular.games, 2);
  assert.equal(s.regular.seasons[0].games, 2);
  // 12 points over the two games he played: (0 + 12) / 2. The dashed line adds no game and no zero.
  assert.equal(s.regular.seasons[0].line.pts, 6);
  assert.equal(s.regular.career.pts, 6);
  // Minutes average over the same two games: (0 + 31) / 2.
  assert.equal(s.regular.seasons[0].line.min, 15.5);
});
