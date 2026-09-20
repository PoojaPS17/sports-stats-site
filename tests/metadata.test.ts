import { test } from "node:test";
import assert from "node:assert/strict";
import { pageMeta } from "../src/lib/metadata";

// The root layout sets the robots hint (max-image-preview, max-snippet). Next shallow-merges
// metadata, so a page that returns any `robots` value, or none, replaces the root's whole object:
// pageMeta must therefore always carry the full directive itself.
const INDEXABLE = { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 } };

test("an indexable page carries the full robots directive", () => {
  assert.deepEqual(pageMeta("T", "D", "/nba").robots, INDEXABLE);
  assert.deepEqual(pageMeta("T", "D", "/nba", { noindex: false }).robots, INDEXABLE);
  assert.deepEqual(pageMeta("T", "D").robots, INDEXABLE);
  assert.deepEqual(pageMeta("T", "D", "/nba", { ownImage: true }).robots, INDEXABLE);
});

test("a noindex page stays noindex, follow", () => {
  assert.deepEqual(pageMeta("T", "D", "/nba", { noindex: true }).robots, { index: false, follow: true });
  assert.deepEqual(pageMeta("T", "D", undefined, { noindex: true }).robots, { index: false, follow: true });
});

// Every page whose data can be empty passes a condition, not a literal; both branches must work.
test("noindex follows the flag it is given", () => {
  for (const empty of [true, false]) {
    const robots = pageMeta("T", "D", "/nba/players/x", { noindex: empty }).robots as { index: boolean };
    assert.equal(robots.index, !empty);
  }
});
