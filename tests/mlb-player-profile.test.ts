// MLB as a sport the player pages understand: which columns a batter's game log and season table
// carry, which a pitcher's does, and how the two aggregate — a batting average is hits over at bats,
// never an average of per-game averages, and innings pitched are counted in outs, because "5.2"
// means five and two thirds and 5.2 + 5.2 is 11.1, not 10.4.
import test from "node:test";
import assert from "node:assert/strict";
import { aggregate, cell, formatStat, playerSport, positionLabel, sportProfile, type PlayerLogRow, type Stats } from "../src/lib/playerProfile";
import { inningsFromOuts, outsFromInnings } from "../src/lib/playerDerived";
import { countRegularGames } from "../src/lib/compareGames";
import { statTitle } from "../src/lib/statGlossary";

const row = (stats: Stats, over: Partial<PlayerLogRow> = {}): PlayerLogRow =>
  ({
    game_espn_id: "1",
    date: "2026-06-01T23:10:00Z",
    season_year: 2026,
    round: null,
    week: null,
    stage: "regular",
    season_type: 2,
    competition_type: "STD",
    is_home: true,
    team_espn_id: "10",
    team_name: "New York Yankees",
    team_slug: "new-york-yankees",
    team_abbr: "NYY",
    team_logo: null,
    opponent_espn_id: "2",
    opponent_name: "Boston Red Sox",
    opponent_slug: "boston-red-sox",
    opponent_abbr: "BOS",
    opponent_logo: null,
    team_score: 5,
    opponent_score: 3,
    result: "W",
    stats,
    ...over,
  }) as PlayerLogRow;

const batting = (line: Partial<Record<string, string>>): Stats => ({ batting: { GS: "1", ...line } as Record<string, string> });
const pitching = (line: Partial<Record<string, string>>): Stats => ({ pitching: line as Record<string, string> });

test("mlb is a sport of its own, not folded into basketball or football", () => {
  assert.equal(playerSport("mlb"), "mlb");
  assert.equal(playerSport("nba"), "nba");
  assert.equal(playerSport("epl"), "soccer");
  assert.equal(playerSport("ipl"), null);
});

test("innings pitched convert to outs and back, because the printed figure is not a decimal", () => {
  assert.equal(outsFromInnings("5.2"), 17, "five innings and two outs");
  assert.equal(outsFromInnings("6"), 18);
  assert.equal(outsFromInnings("0.1"), 1);
  assert.equal(outsFromInnings("--"), null);
  assert.equal(outsFromInnings(null), null);
  assert.equal(inningsFromOuts(17), 5.2);
  assert.equal(inningsFromOuts(34), 11.1, "two outings of 5.2 are 11.1 innings, not 10.4");
  assert.equal(inningsFromOuts(18), 6);
  assert.equal(inningsFromOuts(0), 0);
});

test("a batter's columns are the ones a box score prints, ending in the average", () => {
  const profile = sportProfile("mlb", [row(batting({ AB: "4", R: "1", H: "2", HR: "1", RBI: "3", BB: "0", K: "1" }))]);
  assert.equal(profile.sport, "mlb");
  assert.equal(profile.gamesLabel, "GP");
  assert.deepEqual(
    profile.specs.filter((s) => s.table !== false).map((s) => s.label),
    ["GS", "AB", "R", "H", "HR", "RBI", "BB", "K", "AVG"],
  );
  // No pitching columns on a player who has never pitched.
  assert.ok(!profile.specs.some((s) => s.key === "era"));
});

test("a pitcher's columns are his own, and none of the batter's", () => {
  const profile = sportProfile("mlb", [row(pitching({ IP: "6.0", H: "4", R: "1", ER: "1", BB: "2", K: "8", HR: "0" }))]);
  assert.deepEqual(
    profile.specs.filter((s) => s.table !== false).map((s) => s.label),
    ["IP", "H", "R", "ER", "BB", "K", "HR", "ERA"],
  );
  assert.ok(!profile.specs.some((s) => s.key === "avg"));
});

test("a two-way player gets both sets of columns", () => {
  const rows = [row({ ...batting({ AB: "4", H: "2", HR: "1", RBI: "2", R: "1", BB: "1", K: "0" }), ...pitching({ IP: "6.0", H: "3", R: "1", ER: "1", BB: "1", K: "9", HR: "0" }) })];
  const profile = sportProfile("mlb", rows);
  const labels = profile.specs.map((s) => s.key);
  assert.ok(labels.includes("avg") && labels.includes("era"), "both the batting average and the ERA");
  // The two categories' identical labels are separate keys, so neither total overwrites the other.
  assert.equal(profile.specs.filter((s) => s.label === "H").length, 2);
  assert.equal(new Set(profile.specs.map((s) => s.key)).size, profile.specs.length, "every spec key is unique");
});

test("a batting average over a season is hits over at bats, not a mean of game averages", () => {
  const profile = sportProfile("mlb", []);
  const rows = [
    row(batting({ AB: "4", H: "2", HR: "1", RBI: "3", R: "1", BB: "0", K: "1" })),
    row(batting({ AB: "1", H: "1", HR: "0", RBI: "0", R: "0", BB: "2", K: "0" })),
  ];
  const line = aggregate(rows, profile.specs);
  assert.equal(line.ab, 5);
  assert.equal(line.h, 3);
  assert.equal(line.hr, 1);
  assert.equal(line.rbi, 3);
  assert.equal(line.bb, 2);
  // 3 for 5 is .600. The mean of .500 and 1.000 would be .750, which is the trap.
  assert.equal(line.avg, 0.6);
});

test("innings and an ERA over a season come from the outs, and print as baseball prints them", () => {
  const profile = sportProfile("mlb", [row(pitching({ IP: "5.2", ER: "2" }))]);
  const rows = [row(pitching({ IP: "5.2", H: "5", R: "3", ER: "2", BB: "1", K: "7", HR: "1" })), row(pitching({ IP: "5.2", H: "4", R: "1", ER: "1", BB: "2", K: "6", HR: "0" }))];
  const line = aggregate(rows, profile.specs);
  assert.equal(line.p_outs, 34);
  assert.equal(line.ip, 11.1, "eleven and one third innings");
  assert.equal(line.er, 3);
  // 27 earned runs per out: 3 earned runs over 34 outs is 2.38.
  assert.ok(line.era !== null);
  assert.equal(Number(line.era!.toFixed(2)), 2.38);

  const era = profile.specs.find((s) => s.key === "era")!;
  const ip = profile.specs.find((s) => s.key === "ip")!;
  const avg = sportProfile("mlb", [row(batting({ AB: "4", H: "2" }))]).specs.find((s) => s.key === "avg")!;
  assert.equal(formatStat(era, line.era), "2.38");
  assert.equal(formatStat(ip, line.ip), "11.1");
  assert.equal(formatStat(avg, 0.6), ".600", "a baseball rate is printed without its leading zero");
  assert.equal(formatStat(avg, 1), "1.000", "a perfect average keeps its one");
});

test("a single game's own average and ERA are the game's, not the season-to-date figures ESPN puts in the box score", () => {
  const profile = sportProfile("mlb", [row(batting({ AB: "4", H: "2" })), row(pitching({ IP: "6.0", ER: "2" }))]);
  const avg = profile.specs.find((s) => s.key === "avg")!;
  const era = profile.specs.find((s) => s.key === "era")!;
  // ESPN's AVG cell is the player's season figure after the game; the log shows the game's own 2-for-4.
  assert.equal(avg.value(batting({ AB: "4", H: "2", AVG: ".291" })), 0.5);
  assert.equal(avg.value(batting({ AB: "0", H: "0", BB: "1" })), null, "no at bats, no average");
  assert.equal(era.value(pitching({ IP: "6.0", ER: "2", ERA: "3.44" })), 3);
  assert.equal(era.value(pitching({ IP: "0.0", ER: "1" })), null, "no outs, no ERA");
});

test("baseball positions read as words", () => {
  assert.equal(positionLabel("mlb", "SP"), "Starting pitcher");
  assert.equal(positionLabel("mlb", "CF"), "Center fielder");
  assert.equal(positionLabel("mlb", "DH"), "Designated hitter");
  assert.equal(positionLabel("mlb", "1B"), "First baseman");
  // A code with no wording falls back to the code itself, as every other sport's does.
  assert.equal(positionLabel("mlb", "ZZ"), "ZZ");
  assert.equal(positionLabel("mlb", null), null);
});

test("the box score's baseball column codes have tooltips", () => {
  assert.equal(statTitle("AB"), "At bats");
  assert.equal(statTitle("RBI"), "Runs batted in");
  assert.equal(statTitle("IP"), "Innings pitched");
  assert.equal(statTitle("ER"), "Earned runs");
  assert.equal(statTitle("ERA"), "Earned run average");
  assert.equal(statTitle("PC-ST"), "Pitches thrown / strikes");
  assert.equal(statTitle("H-AB"), "Hits / at bats");
});

test("a player comparison counts MLB regular-season games only, as it does the NBA's and NFL's", () => {
  const rows = [{ stage: "regular" }, { stage: "playoffs" }, { stage: "excluded" }];
  assert.equal(countRegularGames(rows, "mlb"), 1);
  assert.equal(countRegularGames(rows, "nba"), 1);
  assert.equal(countRegularGames(rows, "soccer"), 3, "every appearance counts in football, as it always has");
});

test("`cell` reads a baseball compound figure, so a hits-at-bats cell is usable", () => {
  assert.equal(cell(batting({ "H-AB": "2-4" }), "batting", "H-AB", 0), 2);
  assert.equal(cell(batting({ "H-AB": "2-4" }), "batting", "H-AB", 1), 4);
  assert.equal(cell(pitching({ "PC-ST": "104-60" }), "pitching", "PC-ST", 1), 60);
});
