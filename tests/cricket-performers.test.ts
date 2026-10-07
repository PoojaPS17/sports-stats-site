import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseCricketScorecard } from "../src/lib/matchDetail";
import { topPerformers } from "../src/lib/cricketPerformers";

// Pakistan Women U19 v Bangladesh Women U19, a finished T20 with a Player of the Match (Nishita Akter Nishi, 23 and 2/16).
const summary = JSON.parse(readFileSync(new URL("./fixtures/espn-cricket-summary-1554707.json", import.meta.url), "utf8"));
const scorecard = parseCricketScorecard(summary);

test("the Player of the Match takes the large card with her best line, the innings leaders fill the small ones", () => {
  const { large, small } = topPerformers(scorecard, "Nishita Akter Nishi");
  assert.deepEqual(large, { athleteId: "1352217", name: "Nishita Akter Nishi", teamId: "1336139", innings: 2, kind: "bowl", figure: "2/16", detail: "4 overs · econ 4.00" });
  assert.deepEqual(
    small.map((p) => [p.name, p.kind, p.figure, p.innings]),
    [
      ["Sadia Akter", "bat", "34*", 1],
      ["Mahnoor Zeb", "bowl", "3/24", 1],
      ["Komal Khan", "bat", "29", 2],
    ]
  );
  assert.equal(small[0].detail, "25 balls · 1 four · 2 sixes · SR 136.00");
  assert.equal(small[1].detail, "4 overs · econ 6.00");
  assert.equal(small[0].teamId, "1336139");
});

test("without a Player of the Match the top scorer of the match takes the large card", () => {
  const { large, small } = topPerformers(scorecard, null);
  assert.equal(large?.name, "Sadia Akter");
  assert.equal(large?.figure, "34*");
  assert.deepEqual(
    small.map((p) => p.name),
    ["Mahnoor Zeb", "Komal Khan", "Nishita Akter Nishi"]
  );
});

test("a Player of the Match who batted big and bowled little is shown batting", () => {
  const { large } = topPerformers(scorecard, "Komal Khan");
  assert.deepEqual([large?.kind, large?.figure, large?.detail], ["bat", "29", "39 balls · 3 fours · SR 74.35"]);
});

test("an empty scorecard gives no cards", () => {
  assert.deepEqual(topPerformers([], "Someone"), { large: null, small: [] });
});
