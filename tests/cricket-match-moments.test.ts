import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { deriveMatchStory } from "../src/lib/cricketBalls";
import { keyMoments, parseMilestones } from "../src/lib/cricketMatchMoments";
import type { CricketTeamScorecard } from "../src/lib/matchDetail";

// India v West Indies, 3rd ODI, New Chandigarh, 2026-10-03: ESPN's 58 summary notes.
const notes = JSON.parse(readFileSync(new URL("./fixtures/espn-cricket-notes-1529229.json", import.meta.url), "utf8")) as unknown[];
const balls = JSON.parse(readFileSync(new URL("./fixtures/espn-cricket-playbyplay-1529230.json", import.meta.url), "utf8")) as unknown[];
const names = ["Rohit Sharma", "Ruturaj Gaikwad", "KL Rahul", "Shai Hope", "Amir Jangoo", "Naman Dhir"];

test("match notes become milestones in SportsDB's words, per innings, with the shapes ESPN did not document dropped", () => {
  const m = parseMilestones(notes, names);
  const byKind = (inn: number, kind: string) => m.filter((x) => x.innings === inn && x.kind === kind);
  assert.equal(byKind(1, "team").length, 7);
  assert.equal(byKind(2, "team").length, 7);
  assert.deepEqual(byKind(1, "team")[0], { innings: 1, over: 13.5, kind: "team", text: "India 50 up in 13.5 overs" });
  assert.equal(byKind(2, "team")[0].text, "West Indies 50 up in 6.2 overs");
  assert.deepEqual(
    byKind(1, "batter").map((x) => x.text),
    ["Rohit Sharma 50 off 58 balls (3 fours, 2 sixes)", "Ruturaj Gaikwad 50 off 64 balls (1 four, 3 sixes)", "KL Rahul 50 off 41 balls (5 fours, 1 six)", "KL Rahul 100 off 80 balls (9 fours, 3 sixes)"]
  );
  // a batter's landmark carries no over of its own: it sits at the last over the innings had reached
  assert.equal(byKind(1, "batter")[0].over, 13.5);
  assert.equal(byKind(2, "batter")[0].text, "Shai Hope 50 off 46 balls (6 fours)");
  assert.deepEqual(
    byKind(1, "stand").map((x) => x.text),
    ["3rd-wicket stand 50 in 67 balls", "3rd-wicket stand 100 in 105 balls", "5th-wicket stand 50 in 33 balls", "8th-wicket stand 50 in 23 balls"]
  );
  assert.deepEqual(byKind(1, "powerplay")[0], { innings: 1, over: 10, kind: "powerplay", text: "Powerplay 1 (overs 0.1 to 10.0): 28 runs, 2 wickets" });
  assert.equal(byKind(1, "powerplay").length, 3);
  assert.deepEqual(byKind(1, "drinks")[0], { innings: 1, over: 13.5, kind: "drinks", text: "Drinks: India 55/2 after 13.5 overs" });
  assert.deepEqual(byKind(1, "break"), [{ innings: 1, over: 50, kind: "break", text: "Innings break: India 351/7 in 50 overs" }]);
  assert.equal(byKind(2, "break").length, 0);
  // reviews, the over-rate penalty and the keeper swap have no shape of their own and never show
  assert.equal(m.length, 7 + 7 + 4 + 4 + 4 + 5 + 3 + 3 + 2 + 2 + 1);
  assert.ok(m.every((x) => !/Review|Penalty|kept wickets/.test(x.text)));
});

test("a short name that matches no one is kept as ESPN wrote it", () => {
  const m = parseMilestones([{ type: "matchnote", text: "India innings" }, { type: "matchnote", text: "XY Nobody: 50 off 30 balls (4 x 4, 1 x 6)" }], names);
  assert.equal(m[0].text, "XY Nobody 50 off 30 balls (4 fours, 1 six)");
  assert.deepEqual(parseMilestones(undefined), []);
  assert.deepEqual(parseMilestones([{ type: "toss", text: "India, elected to bat first" }]), []);
});

test("key moments merge the wickets of the ball-by-ball with the milestones, innings by innings, in over order", () => {
  const story = deriveMatchStory(balls);
  const milestones = parseMilestones([
    { type: "matchnote", text: "West Indies innings" },
    { type: "matchnote", text: "Powerplay 1: Overs 0.1 - 6.0 (Mandatory - 44 runs, 2 wickets)" },
    { type: "matchnote", text: "West Indies: 50 runs in 7.2 overs (46 balls), Extras 3" },
    { type: "matchnote", text: "India innings" },
    { type: "matchnote", text: "India: 50 runs in 4.5 overs (29 balls), Extras 2" },
  ]);
  const moments = keyMoments(story, milestones);
  assert.deepEqual(
    moments.slice(0, 5).map((x) => [x.innings, x.over, x.kind, x.text]),
    [
      [1, 4.3, "wicket", "Kamil Pooran b Arshdeep Singh 12 · 38/1"],
      // run out at the non-striker's end: the striker's runs are not his, so the line carries none
      [1, 5.2, "wicket", "Shimron Hetmyer run out · 44/2"],
      [1, 5.5, "wicket", "Rovman Powell b Axar Patel 0 · 44/3"],
      [1, 6, "powerplay", "Powerplay 1 (overs 0.1 to 6.0): 44 runs, 2 wickets"],
      [1, 7.2, "team", "West Indies 50 up in 7.2 overs"],
    ]
  );
  assert.equal(moments[0].teamId, "4");
  assert.equal(moments.filter((x) => x.kind === "wicket").length, 12);
  assert.equal(moments.filter((x) => x.innings === 2)[0].teamId, "6");
  assert.equal(moments.find((x) => x.innings === 2 && x.kind === "team")?.text, "India 50 up in 4.5 overs");
});

test("without a ball-by-ball the wickets come from the scorecard's dismissal lines, in batting order", () => {
  const scorecard: CricketTeamScorecard[] = [
    {
      teamId: "1",
      teamName: "Side A",
      battingLabels: ["R", "B", "4s", "6s", "SR"],
      battingRows: [
        { name: "A One", athleteId: "a1", stats: ["12", "20", "1", "0", "60.00"], innings: 1, position: 1, dismissal: "c Keeper b Quick" },
        { name: "A Two", athleteId: "a2", stats: ["40", "30", "4", "1", "133.33"], innings: 1, position: 2, dismissal: "not out" },
        { name: "A Three", athleteId: "a3", stats: ["0", "2", "0", "0", "0.00"], innings: 1, position: 3, dismissal: "run out (Fielder)" },
      ],
      bowlingLabels: ["O", "M", "R", "W", "Econ"],
      bowlingRows: [],
      innings: [{ period: 1, runs: 52, wickets: 2, overs: 10, description: "complete" }],
    },
  ];
  const moments = keyMoments([], [], scorecard);
  assert.deepEqual(
    moments.map((x) => [x.innings, x.over, x.kind, x.text, x.teamId]),
    [
      [1, null, "wicket", "A One c Keeper b Quick 12", "1"],
      [1, null, "wicket", "A Three run out (Fielder) 0", "1"],
    ]
  );
});
