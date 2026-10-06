import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { deriveMatchStory, type StoryInnings } from "../src/lib/cricketBalls";
import { parseCricketScorecard, type CricketTeamScorecard } from "../src/lib/matchDetail";
import { economyWidth, inningsFromQuery, scorecardTabs, strikeRateWidth } from "../src/lib/cricketScorecardView";

const summary = JSON.parse(readFileSync(new URL("./fixtures/espn-cricket-summary-1554707.json", import.meta.url), "utf8"));
const balls = JSON.parse(readFileSync(new URL("./fixtures/espn-cricket-playbyplay-1529230.json", import.meta.url), "utf8")) as unknown[];
const story = deriveMatchStory(balls);

const row = (name: string, id: string, runs: number, innings: number) => ({ name, athleteId: id, stats: [String(runs), "30", "2", "1", "100.00"], innings, position: 1, dismissal: "not out" });
// The 1st T20I as a scorecard: the two sides' innings totals with a few batters, so the extras arithmetic is known.
const t20i: CricketTeamScorecard[] = [
  { teamId: "4", teamName: "West Indies", battingLabels: ["R", "B", "4s", "6s", "SR"], battingRows: [row("Shai Hope", "h", 52, 1)], bowlingLabels: ["O", "M", "R", "W", "Econ"], bowlingRows: [{ name: "Akeal Hosein", athleteId: "ah", stats: ["4", "0", "30", "2", "7.50"], innings: 2, position: 1, dismissal: null }], innings: [{ period: 1, runs: 171, wickets: 10, overs: 19.1, description: "all out" }] },
  { teamId: "6", teamName: "India", battingLabels: ["R", "B", "4s", "6s", "SR"], battingRows: [row("Shreyas Iyer", "si", 102, 2), row("Ishan Kishan", "ik", 50, 2)], bowlingLabels: ["O", "M", "R", "W", "Econ"], bowlingRows: [{ name: "Arshdeep Singh", athleteId: "as", stats: ["4", "0", "28", "3", "7.00"], innings: 1, position: 1, dismissal: null }], innings: [{ period: 2, runs: 172, wickets: 2, overs: 14.4, description: "target reached" }] },
];

test("one tab per innings block, labelled with the side and its total, coloured by the side, with extras, total line and fall of wickets from the story", () => {
  const tabs = scorecardTabs(t20i, story, { "4": "#790d1a", "6": "#050ceb" });
  assert.deepEqual(
    tabs.map((t) => [t.key, t.team, t.label, t.colour]),
    [
      ["1", "West Indies", "West Indies · 171 all out (19.1 ov)", "#790d1a"],
      ["2", "India", "India · 172/2 (14.4 ov)", "#050ceb"],
    ]
  );
  assert.equal(tabs[0].extras.total, 119);
  assert.equal(tabs[1].extras.total, 20);
  assert.equal(tabs[0].totalLine, "171 all out · 19.1 overs · run rate 8.92");
  assert.match(tabs[1].totalLine ?? "", /^172\/2 · 14\.4 overs · run rate \d+\.\d\d$/);
  assert.match(tabs[0].fallOfWickets ?? "", /^1-38 Pooran \(4\.3\), 2-44 Hetmyer \(5\.2\), 3-44 Powell \(5\.5\), /);
  assert.equal(tabs[0].fallOfWickets?.split(", ").length, 10);
  assert.equal(tabs[1].fallOfWickets, "1-29 Sharma (2.3), 2-35 Samson (3.3)");
  assert.equal(tabs[0].block.bowling.rows[0].name, "Arshdeep Singh");
});

test("the extras breakdown counts the balls' flags: wides and byes for their runs, a no-ball for one", () => {
  const inn: StoryInnings = { ...story[0], overs: [{ number: 1, runs: 16, wickets: 0, balls: [{ symbol: "wd", runs: 1, wicket: false, extra: "wd" }, { symbol: "4", runs: 5, wicket: false, extra: "nb" }, { symbol: "4", runs: 4, wicket: false, extra: "lb" }, { symbol: "2", runs: 2, wicket: false, extra: "b" }, { symbol: "4", runs: 4, wicket: false, extra: null }] }] };
  const [tab] = scorecardTabs([t20i[0]], [inn], {});
  assert.equal(tab.extras.breakdown, "b 2, lb 4, w 1, nb 1");
  assert.equal(tab.colour, null);
});

test("without a story the tabs still carry totals and extras from the scorecard, with no bars' colour, breakdown or fall of wickets", () => {
  const scorecard = parseCricketScorecard(summary);
  const tabs = scorecardTabs(scorecard, [], {});
  assert.deepEqual(
    tabs.map((t) => t.label),
    ["Bangladesh Women Under-19s · 117/8 (20 ov)", "Pakistan Women Under-19s · 87/6 (20 ov)"]
  );
  const batted = scorecard.find((t) => t.teamId === "1336139")!.battingRows.filter((r) => r.innings === 1).reduce((s, r) => s + Number(r.stats[0]), 0);
  assert.equal(tabs[0].extras.total, 117 - batted);
  assert.equal(tabs[0].extras.breakdown, null);
  assert.equal(tabs[0].fallOfWickets, null);
  assert.equal(tabs[0].totalLine, "117/8 · 20 overs · run rate 5.85");
  assert.equal(tabs[0].colour, null);
});

test("bar widths: strike rate over 250 and economy over 20 fill the cell; non-numbers draw nothing", () => {
  assert.equal(strikeRateWidth("136.00"), 54.4);
  assert.equal(strikeRateWidth("300"), 100);
  assert.equal(strikeRateWidth("-"), 0);
  assert.equal(economyWidth("6.00"), 30);
  assert.equal(economyWidth("25"), 100);
  assert.equal(economyWidth(""), 0);
});

test("?innings= picks the opening tab when it names one, else the first", () => {
  assert.equal(inningsFromQuery("?innings=2", ["1", "2"]), "2");
  assert.equal(inningsFromQuery("", ["1", "2"]), "1");
  assert.equal(inningsFromQuery("?innings=9", ["1", "2"]), "1");
});
