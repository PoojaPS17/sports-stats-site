import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// The archived-league game page (/odi/games/<id>, /ipl/games/<id>, ...) needs a database to render, so its
// cricket composition is checked at the source.
const page = readFileSync(new URL("../src/app/[league]/games/[id]/page.tsx", import.meta.url), "utf8");

test("cricket games open with the match hero in place of the generic header, under the page's own sr-only h1", () => {
  assert.match(page, /isCricket \? \(\s*<CricketMatchHero/);
  assert.match(page, /headingTag="p"/);
  assert.match(page, /<MatchHeader league=\{league\} game=\{game\} scorecard=\{cricketScorecard\} \/>/);
  assert.match(page, /<h1 className="sr-only">/);
});

test("the match story is drawn for limited-overs cricket that is live or recent, never for first-class", () => {
  assert.match(page, /<CricketMatchStory/);
  assert.match(page, /isFirstClassCricket\(league\)/);
  assert.match(page, /shouldFetchStory\(/);
  assert.match(page, /fetchCricketBallByBall\(id, [^)]*\{ settled: game\.completed \}\)/);
});

test("the Player of the Match and the pills come from the ESPN summary the page already reads, and never block the render", () => {
  assert.match(page, /matchPills\(summary\?\.notes\)/);
  assert.match(page, /potmLine\(/);
  assert.match(page, /playerOfTheMatch/);
});

test("the cricket summary is read through the cricket fetcher, which resolves every international and franchise match", () => {
  assert.match(page, /fetchCricketSummaryLive\(id, "8048"/);
  assert.doesNotMatch(page, /loaded\.summary \?\? \(await fetchMatchSummary\(league, id\)\)/);
});

test("the league game page carries the same story blocks for cricket, with player links from the slug lookup", () => {
  assert.match(page, /<CricketKeyMoments/);
  assert.match(page, /<CricketTopPerformers[^>]*playerSlugs=\{playerSlugs\}/);
  assert.match(page, /<CricketPartnerships/);
  assert.match(page, /<CricketNextMatch/);
  assert.match(page, /getCricketSeriesMatch\(id\)/);
  assert.match(page, /parseMilestones\(summary\?\.notes, names\)/);
});
