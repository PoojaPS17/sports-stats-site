// How a box-score cell is read, and what that does to a season's totals when a game is negative.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildProfile, cell, type PlayerLogRow, type Stats } from "../src/lib/playerProfile";

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
