import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { deriveMatchStory } from "../src/lib/cricketBalls";
import { parseCricketScorecard, type CricketTeamScorecard } from "../src/lib/matchDetail";
import { scorecardTabs } from "../src/lib/cricketScorecardView";
import { playingXi } from "../src/lib/cricketPlayingXi";
import { inningsShareText, inningsText, scorecardText, xiText } from "../src/lib/cricketShareText";
import { shareCaption } from "../src/lib/cricketShare";

const summary = JSON.parse(readFileSync(new URL("./fixtures/espn-cricket-summary-1554707.json", import.meta.url), "utf8"));
const balls = JSON.parse(readFileSync(new URL("./fixtures/espn-cricket-playbyplay-1529230.json", import.meta.url), "utf8")) as unknown[];
const story = deriveMatchStory(balls);
const LINK = "https://sports-db.live/cricket/matches/1554707";

const row = (name: string, id: string, runs: number, b: number, innings: number, out = "not out") => ({ name, athleteId: id, stats: [String(runs), String(b), "2", "1", "100.00"], innings, position: 1, dismissal: out });
// The 1st T20I as a small scorecard whose ball-by-ball is the fixture's, so extras and the fall of wickets are known.
const t20i: CricketTeamScorecard[] = [
  { teamId: "4", teamName: "West Indies", battingLabels: ["R", "B", "4s", "6s", "SR"], battingRows: [row("Shai Hope", "h", 52, 38, 1, "c Axar Patel b Naman Dhir"), row("Rovman Powell", "rp", 31, 20, 1)], bowlingLabels: ["O", "M", "R", "W", "Econ"], bowlingRows: [{ name: "Akeal Hosein", athleteId: "ah", stats: ["4", "0", "30", "2", "7.50"], innings: 2, position: 1, dismissal: null }], innings: [{ period: 1, runs: 171, wickets: 10, overs: 19.1, description: "all out" }] },
  { teamId: "6", teamName: "India", battingLabels: ["R", "B", "4s", "6s", "SR"], battingRows: [row("Shreyas Iyer", "si", 102, 43, 2), { name: "Axar Patel", athleteId: "ap", stats: ["-", "-", "-", "-", "-"], innings: 2, position: 3, dismissal: null }], bowlingLabels: ["O", "M", "R", "W", "Econ"], bowlingRows: [{ name: "Arshdeep Singh", athleteId: "as", stats: ["4", "0", "28", "3", "7.00"], innings: 1, position: 1, dismissal: null }], innings: [{ period: 2, runs: 172, wickets: 2, overs: 14.4, description: "target reached" }] },
];

test("one innings as WhatsApp text: batters with runs (balls), not-outs starred, extras, bowlers with figures, fall of wickets", () => {
  const tabs = scorecardTabs(t20i, story, {});
  assert.equal(
    inningsText(tabs[0]),
    [
      "West Indies: 171 all out (19.1 ov)",
      "",
      "Batting",
      "Shai Hope 52 (38)",
      "Rovman Powell 31* (20)",
      "Extras 88 (b 2, lb 5, w 0, nb 1)",
      "",
      "Bowling (India)",
      "Arshdeep Singh 3/28 (4 ov)",
      "",
      "Fall of wickets: 1-38 Pooran (4.3), 2-44 Hetmyer (5.2), 3-44 Powell (5.5), 4-107 Hope (11.4), 5-114 Chase (12.3), 6-121 Shepherd (13.2), 7-124 Forde (14.1), 8-135 Springer (15.5), 9-171 Rutherford (18.5), 10-171 Hosein (19.1)",
    ].join("\n")
  );
});

test("a batter with no figures is listed under Did not bat, and a chase's second innings reads the same way", () => {
  const tabs = scorecardTabs(t20i, story, {});
  assert.equal(
    inningsText(tabs[1]),
    ["India: 172/2 (14.4 ov)", "", "Batting", "Shreyas Iyer 102* (43)", "Did not bat: Axar Patel", "Extras 70 (b 0, lb 0, w 0, nb 1)", "", "Bowling (West Indies)", "Akeal Hosein 2/30 (4 ov)", "", "Fall of wickets: 1-29 Sharma (2.3), 2-35 Samson (3.3)"].join("\n")
  );
});

test("the whole scorecard: match name and result, every innings, the link last; no markdown", () => {
  const tabs = scorecardTabs(parseCricketScorecard(summary), [], {});
  const text = scorecardText({ matchName: "Pakistan Women Under-19s vs Bangladesh Women Under-19s", result: "BAN-WMN U19 won by 30 runs", tabs, link: LINK });
  const lines = text.split("\n");
  assert.equal(lines[0], "Pakistan Women Under-19s vs Bangladesh Women Under-19s");
  assert.equal(lines[1], "BAN-WMN U19 won by 30 runs");
  assert.equal(lines.at(-1), LINK);
  assert.ok(text.includes("\n\nBangladesh Women Under-19s: 117/8 (20 ov)\n\nBatting\nMymuna Nahar Shorna 0 (3)\n"));
  assert.ok(text.includes("Sadia Akter 34* (25)\n"));
  assert.ok(text.includes("\nBowling (Pakistan Women Under-19s)\nMahnoor Zeb 3/24 (4 ov)\n"));
  assert.ok(text.includes("\n\nPakistan Women Under-19s: 87/6 (20 ov)\n\nBatting\nRavail Farhan 17 (12)\n"));
  assert.doesNotMatch(text, /[*_`#]\w/);
});

test("this innings only: the same text under the match name, for the tab that is open", () => {
  const tabs = scorecardTabs(t20i, story, {});
  const text = inningsShareText({ matchName: "India vs West Indies", result: "India won by 8 wkts (32b rem)", tab: tabs[1], link: "L" });
  assert.equal(text.split("\n").slice(0, 3).join("|"), "India vs West Indies|India won by 8 wkts (32b rem)|");
  assert.ok(text.endsWith("\n\nL"));
  assert.ok(!text.includes("West Indies: 171"));
});

test("the Playing XI: numbered, captain (c) and wicketkeeper (wk) marked, both marks on one player", () => {
  const sides = playingXi(summary);
  assert.equal(
    xiText({ matchName: "Pakistan vs Bangladesh", sides, link: LINK }),
    [
      "Pakistan vs Bangladesh: Playing XI",
      "",
      "Pakistan Women Under-19s",
      "1. Ravail Farhan",
      "2. Komal Khan (wk)",
      "3. Pakeeza Shabbir",
      "4. Zoofishan Ayyaz",
      "5. Aqsa Habib",
      "6. Shahar Bano",
      "7. Fizza Fiaz (c)",
      "8. Mah Noor Iqbal",
      "9. Maham Nazakat",
      "10. Rozina Akram",
      "11. Mahnoor Zeb",
      "",
      "Bangladesh Women Under-19s",
      "1. Mymuna Nahar Shorna",
      "2. Ochena Jannat (wk)",
      "3. Nishita Akter Nishi",
      "4. Sadia Islam (c)",
      "5. Bibi Ayesha",
      "6. Sadia Akter",
      "7. Farjana Easmin",
      "8. Sraboni Rani",
      "9. Tithi Das",
      "10. Oddrita Nowshin",
      "11. Afrin Mim",
      "",
      LINK,
    ].join("\n")
  );
  const both = xiText({ matchName: "A vs B", sides: [{ teamId: "1", team: "A", players: [{ id: "1", name: "Sam Curran", captain: true, keeper: true, role: null }] }], link: "L" });
  assert.ok(both.includes("1. Sam Curran (c, wk)"));
});

test("the share caption: score line, the result, the match link on its own line, no hashtags", () => {
  const header = {
    state: "post" as const,
    sides: [
      { name: "West Indies", logo: null, score: "171", winner: false },
      { name: "India", logo: null, score: "172/2 (14.4/20 ov, target 172)", winner: true },
    ],
    result: "India won by 8 wkts (32b rem)",
  };
  assert.equal(shareCaption(header, "https://sports-db.live/cricket/matches/1"), "West Indies 171 v India 172/2. India won by 8 wkts (32b rem).\nhttps://sports-db.live/cricket/matches/1");
  assert.equal(shareCaption({ ...header, state: "in", result: null }, "L"), "West Indies 171 v India 172/2. Live.\nL");
  assert.doesNotMatch(shareCaption(header, "L"), /#/);
});
