import { test } from "node:test";
import assert from "node:assert/strict";
import { matchDidYouKnow, seriesDidYouKnow } from "../src/lib/cricketDidYouKnow";
import { aggregateSeriesStats, type SeriesStatRow } from "../src/lib/cricketSeriesStats";
import type { CricketTeamScorecard } from "../src/lib/matchDetail";

const bat = (name: string, r: number, f: number, x: number, innings = 1) => ({ name, athleteId: name, stats: [String(r), "30", String(f), String(x), "100"], innings });
const bowl = (name: string, o: string, m: number, r: number, w: number) => ({ name, athleteId: name, stats: [o, String(m), String(r), String(w), "5.0"] });
const side = (over: Partial<CricketTeamScorecard>): CricketTeamScorecard => ({
  teamId: "1",
  teamName: "Alpha",
  battingLabels: ["R", "B", "4s", "6s", "SR"],
  battingRows: [],
  bowlingLabels: ["O", "M", "R", "W", "Econ"],
  bowlingRows: [],
  ...over,
});

test("a match reports its boundaries share and a batter's share of an innings", () => {
  const sc = [side({ battingRows: [bat("A One", 80, 8, 4), bat("B Two", 10, 1, 0)], innings: [{ period: 1, runs: 120, wickets: 5, overs: 20, description: "" }] })];
  const lines = matchDidYouKnow(sc);
  // 9 fours + 4 sixes = 36 + 24 = 60 of 90 batters' runs
  assert.ok(lines.includes("13 boundaries (9 fours, 4 sixes) brought 67% of the runs off the bat."), lines.join("|"));
  assert.ok(lines.includes("A One scored 80 of Alpha's 120, 67% of the innings."), lines.join("|"));
});

test("extras that out-score every batter, and a bowler's maidens, are called out", () => {
  const sc = [side({ battingRows: [bat("A One", 12, 1, 0), bat("B Two", 9, 0, 0)], innings: [{ period: 1, runs: 46, wickets: 10, overs: 18, description: "all out" }], bowlingRows: [bowl("C Three", "4", 3, 7, 2)] })];
  const lines = matchDidYouKnow(sc);
  assert.ok(lines.includes("Extras were Alpha's top scorer in innings 1: 25, more than any batter's 12."), lines.join("|"));
  assert.ok(lines.includes("C Three bowled 3 maidens on the way to 2/7."), lines.join("|"));
});

test("nothing is said without the figures, and never more than three lines", () => {
  assert.deepEqual(matchDidYouKnow([]), []);
  assert.deepEqual(matchDidYouKnow([side({ battingLabels: [], battingRows: [bat("A", 80, 8, 4)] })]), []);
  const many = [side({ battingRows: [bat("A One", 90, 9, 5), bat("B Two", 5, 0, 0)], innings: [{ period: 1, runs: 120, wickets: 5, overs: 20, description: "" }], bowlingRows: [bowl("C", "4", 3, 7, 2)] })];
  assert.ok(matchDidYouKnow(many).length <= 3);
});

const row = (match: string, player: string, name: string, sixes: number, fours = 2): SeriesStatRow => ({
  match_espn_id: match,
  stage: null,
  player_espn_id: player,
  player_name: name,
  team_espn_id: "10",
  stats: { batting: { runs: 30, ballsFaced: 20, fours, sixes, notOut: false }, bowling: { overs: 4, conceded: 20, wickets: 2 } },
});

test("a series reports sixes, the top six-hitter and wickets once two matches have figures", () => {
  const stats = aggregateSeriesStats([row("m1", "p1", "Eve Alpha", 4), row("m1", "p2", "Dee Bravo", 1), row("m2", "p1", "Eve Alpha", 3)]);
  assert.deepEqual(stats.totals, { runs: 90, fours: 6, sixes: 8, wickets: 6, hasBoundaries: true });
  assert.deepEqual(seriesDidYouKnow(stats), [
    "8 sixes and 6 fours in 2 matches so far: 4.0 sixes a match.",
    "Eve Alpha has hit the most sixes: 7.",
    "6 wickets have fallen to bowlers, 3.0 a match.",
  ]);
  assert.deepEqual(seriesDidYouKnow(aggregateSeriesStats([row("m1", "p1", "Eve Alpha", 4)])), []);
  assert.deepEqual(seriesDidYouKnow(null), []);
});
