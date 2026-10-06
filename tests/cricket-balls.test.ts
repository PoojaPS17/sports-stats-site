import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { deriveMatchStory } from "../src/lib/cricketBalls";

// India v West Indies, 1st T20I, Lucknow, 2026-10-06: ESPN's 205 play-by-play items trimmed to the fields the parser reads.
const items = JSON.parse(readFileSync(new URL("./fixtures/espn-cricket-playbyplay-1529230.json", import.meta.url), "utf8")) as unknown[];

test("deriveMatchStory splits the balls into innings in match order with the batting side", () => {
  const story = deriveMatchStory(items);
  assert.equal(story.length, 2);
  assert.deepEqual(
    story.map((i) => [i.period, i.team, i.teamId]),
    [
      [1, "West Indies", "4"],
      [2, "India", "6"],
    ]
  );
  assert.deepEqual(story[0].total, { runs: 171, wickets: 10, overs: 19.1 });
  assert.deepEqual(story[1].total, { runs: 172, wickets: 2, overs: 14.4 });
  assert.equal(story[0].runRate, 8.92);
  assert.equal(story[0].target, null);
  assert.equal(story[1].target, 172);
});

test("overs carry runs, wickets and one symbol per delivery", () => {
  const [wi, ind] = deriveMatchStory(items);
  assert.deepEqual(
    wi.overs.map((o) => o.runs),
    [5, 16, 7, 8, 8, 0, 9, 8, 15, 6, 18, 9, 6, 9, 3, 8, 10, 15, 11, 0]
  );
  assert.deepEqual(
    wi.overs.map((o) => o.wickets),
    [0, 0, 0, 0, 1, 2, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 0, 0, 1, 1]
  );
  assert.deepEqual(
    ind.overs.map((o) => o.runs),
    [15, 9, 11, 1, 11, 15, 5, 8, 19, 8, 12, 7, 19, 24, 8]
  );
  assert.deepEqual(
    ind.overs[13].balls.map((b) => b.symbol),
    ["6", "6", "1", "1", "4", "6"]
  );
  assert.deepEqual(
    wi.overs[5].balls.map((b) => b.symbol),
    ["0", "W", "0", "0", "W", "0"]
  );
  // the no-ball four in the 3rd over: four off the bat plus the extra, flagged nb, seven deliveries in the over
  const nb = wi.overs[2].balls[0];
  assert.deepEqual([nb.symbol, nb.runs, nb.extra], ["4", 5, "nb"]);
  assert.equal(wi.overs[2].balls.length, 7);
  // a leg-bye four keeps its runs and says so
  const lb = wi.overs[7].balls[5];
  assert.deepEqual([lb.symbol, lb.runs, lb.extra], ["4", 4, "lb"]);
});

test("wickets name the batter out, the dismissal, the bowler (none for a run out) and the batter's runs", () => {
  const [wi, ind] = deriveMatchStory(items);
  assert.equal(wi.wickets.length, 10);
  assert.deepEqual(wi.wickets[0], { over: 4.3, runs: 38, wicket: 1, batter: "Kamil Pooran", how: "bowled", bowler: "Arshdeep Singh", fielder: null, keeper: false, batterRuns: 12, text: "K Pooran b Arshdeep Singh 12" });
  // Hetmyer was run out at the non-striker's end: no bowler, and the striker's runs are not his
  assert.deepEqual(wi.wickets[1], { over: 5.2, runs: 44, wicket: 2, batter: "Shimron Hetmyer", how: "run out", bowler: null, fielder: null, keeper: false, batterRuns: null, text: "SO Hetmyer run out 5" });
  // a catch names the fielder as well as the bowler
  assert.deepEqual([wi.wickets[3].fielder, wi.wickets[3].bowler], ["Axar Patel", "Naman Dhir"]);
  assert.deepEqual([ind.wickets[1].fielder, ind.wickets[1].bowler], ["Akeal Hosein", "Akeal Hosein"]);
  assert.deepEqual(
    ind.wickets.map((w) => [w.over, w.runs, w.batter, w.batterRuns]),
    [
      [2.3, 29, "Abhishek Sharma", 21],
      [3.3, 35, "Sanju Samson", 11],
    ]
  );
});

test("partnerships are the runs between falls, with the pair at the crease, the last one unbroken", () => {
  const [wi, ind] = deriveMatchStory(items);
  assert.deepEqual(
    wi.partnerships.map((p) => p.runs),
    [38, 6, 0, 63, 7, 7, 3, 11, 36, 0]
  );
  assert.deepEqual(wi.partnerships[3], { wicket: 4, runs: 63, balls: 35, batters: ["Shai Hope", "Sherfane Rutherford"], unbroken: false });
  assert.deepEqual(
    ind.partnerships.map((p) => [p.runs, p.unbroken]),
    [
      [29, false],
      [6, false],
      [137, true],
    ]
  );
  assert.deepEqual(ind.partnerships[2].batters, ["Shreyas Iyer", "Ishan Kishan"]);
  assert.equal(ind.partnerships[2].balls, 67);
});

test("the worm has a point per completed over and the final partial over", () => {
  const [wi, ind] = deriveMatchStory(items);
  assert.deepEqual(wi.worm[0], { over: 1, runs: 5, wickets: 0 });
  assert.deepEqual(wi.worm[19], { over: 19.17, runs: 171, wickets: 10 });
  assert.equal(ind.worm.length, 15);
  assert.deepEqual(ind.worm[14], { over: 14.67, runs: 172, wickets: 2 });
});

test("the innings carries ESPN's over limit, and a complete final over counts as a whole number", () => {
  const [wi, ind] = deriveMatchStory(items);
  assert.equal(wi.limit, 20);
  assert.equal(ind.limit, 20);
  const last = items[items.length - 1] as Record<string, unknown>;
  const whole = { ...last, over: { ...(last.over as object), number: 15, ball: 6, complete: true, actual: 14.6 } };
  const story = deriveMatchStory([...items.slice(0, -1), whole]);
  assert.equal(story[1].total.overs, 15);
  assert.equal(story[1].worm.at(-1)?.over, 15);
});

test("a live partial over places its worm point by legal balls, not by deliveries bowled", () => {
  const last = items[items.length - 1] as Record<string, unknown>;
  // two wides then three legal balls: seven deliveries, 14.3 on the scorecard
  const extras = { ...last, over: { ...(last.over as object), number: 15, ball: 7, complete: false, actual: 14.3 } };
  const story = deriveMatchStory([...items.slice(0, -1), extras]);
  assert.equal(story[1].worm.at(-1)?.over, 14.5);
});

test("an empty or malformed list gives no innings", () => {
  assert.deepEqual(deriveMatchStory([]), []);
  assert.deepEqual(deriveMatchStory([{ nonsense: true }, null]), []);
});
