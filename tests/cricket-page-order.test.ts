import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const read = (rel: string) => readFileSync(fileURLToPath(new URL(`../${rel}`, import.meta.url)), "utf8");

// The scorecard is what visitors (and searches for "<match> scorecard") come for, so it follows the result
// card: scorecard, partnerships, match story, key moments and top performers, then the extra lines.
function assertOrder(src: string, markers: string[]) {
  const at = markers.map((m) => {
    const i = src.indexOf(m);
    assert.ok(i >= 0, `${m} is on the page`);
    return i;
  });
  for (let i = 1; i < at.length; i++) assert.ok(at[i - 1] < at[i], `${markers[i - 1]} comes before ${markers[i]}`);
}

test("the cricket match page (/cricket/matches/<id>) shows the scorecard right after the result card", () => {
  assertOrder(read("src/lib/cricketMatchPage.tsx"), ["<CricketMatchHero", "<CricketScorecardTabs", "<CricketPartnerships", "<CricketMatchStory", "<CricketKeyMoments", "<CricketDidYouKnow", "<CricketPlayingXi"]);
});

test("the archived-league match page (/<league>/games/<id>) shows cricket's scorecard right after the result card", () => {
  assertOrder(read("src/app/[league]/games/[id]/page.tsx"), ["<CricketMatchHero", "<CricketScorecardTabs", "<CricketPartnerships", "<CricketMatchStory", "<CricketKeyMoments", "<CricketDidYouKnow", "<MatchLineups"]);
});
