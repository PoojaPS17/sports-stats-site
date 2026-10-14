import { test } from "node:test";
import assert from "node:assert/strict";
import { NAV_ITEMS } from "../src/lib/nav";

// The header has no spare width: measured on the live site, the main bar left 6-32px free at every desktop width, and an
// MLB tab needs about 47px. MLB took the slot of "Beyond the Scoreline" (163px), which moved into "More".
test("MLB is a top-level tab, between NBA and Cricket", () => {
  const main = NAV_ITEMS.filter((i) => !i.overflow).map((i) => i.label);
  assert.ok(main.includes("MLB"));
  assert.equal(main.indexOf("MLB"), main.indexOf("NBA") + 1);
});

test("the wide editorial link lives under More, and every item is still reachable", () => {
  const more = NAV_ITEMS.filter((i) => i.overflow).map((i) => i.label);
  assert.deepEqual(more, ["Asian Games", "Beyond the Scoreline", "Top Games"]);
  assert.equal(NAV_ITEMS.length, 10);
});
