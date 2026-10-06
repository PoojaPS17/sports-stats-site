import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// The page needs a database to render, so this checks its composition at the source: what it must
// still carry after the redesign, and what it must no longer carry.
const page = readFileSync(new URL("../src/lib/cricketMatchPage.tsx", import.meta.url), "utf8");

test("the match page opens with the hero and the match story", () => {
  assert.match(page, /<CricketMatchHero/);
  assert.match(page, /<CricketMatchStory/);
  assert.doesNotMatch(page, /<section className="card flex flex-col gap-3 px-5 py-5">/);
  assert.doesNotMatch(page, /const sideRow/);
});

test("the SEO surfaces are untouched: h1 line, report paragraph, share tools, schema, metadata", () => {
  assert.match(page, /headline=\{\[matchName, description, seriesName\]\.filter\(Boolean\)\.join\(" · "\)\}/);
  assert.match(page, /cricketMatchReport\(/);
  assert.match(page, /\{report \? <p className="text-sm leading-relaxed">\{report\}<\/p>/);
  assert.match(page, /<ImageActions/);
  assert.match(page, /cricketSeriesMatchSchema\(/);
  assert.match(page, /export async function cricketMatchMetadata/);
});

test("balls are asked for only on a limited-overs match that has started, with the settled window when the match is over", () => {
  assert.match(page, /comp\?\.limitedOvers === true/);
  assert.match(page, /state !== "pre"/);
  assert.match(page, /fetchCricketBallByBall\(id, [^)]*\{ settled: isSettledCricketMatch\(stored, summary\) \}\)/);
});
