import { test } from "node:test";
import assert from "node:assert/strict";
import { sortMedalTally, medalRanks, type OrderableMedal } from "../src/lib/medalTallyOrder";

const row = (over: Partial<OrderableMedal> = {}): OrderableMedal => ({
  nation_slug: "x", nation_name: "X", gold: 0, silver: 0, bronze: 0, ...over,
});

test("sorts by gold, then silver, then bronze, then name", () => {
  const rows = [
    row({ nation_name: "B", nation_slug: "b", gold: 1, silver: 0, bronze: 0 }),
    row({ nation_name: "A", nation_slug: "a", gold: 2, silver: 0, bronze: 0 }),
    row({ nation_name: "D", nation_slug: "d", gold: 1, silver: 2, bronze: 0 }),
    row({ nation_name: "C", nation_slug: "c", gold: 1, silver: 2, bronze: 1 }),
  ];
  const sorted = sortMedalTally(rows);
  assert.deepEqual(sorted.map((r) => r.nation_slug), ["a", "c", "d", "b"]);
});

test("ties on every count break by nation name", () => {
  const rows = [
    row({ nation_name: "Zed", nation_slug: "zed", gold: 1, silver: 1, bronze: 1 }),
    row({ nation_name: "Alpha", nation_slug: "alpha", gold: 1, silver: 1, bronze: 1 }),
  ];
  const sorted = sortMedalTally(rows);
  assert.deepEqual(sorted.map((r) => r.nation_slug), ["alpha", "zed"]);
});

test("medalRanks: distinct rows count up 1,2,3", () => {
  const sorted = sortMedalTally([
    row({ nation_slug: "a", gold: 3 }),
    row({ nation_slug: "b", gold: 2 }),
    row({ nation_slug: "c", gold: 1 }),
  ]);
  assert.deepEqual(medalRanks(sorted), [1, 2, 3]);
});

test("medalRanks: a full tie shares one rank, the next distinct row continues from the count above it (IOC convention: 1, 1, 3)", () => {
  const sorted = sortMedalTally([
    row({ nation_slug: "a", nation_name: "A", gold: 2, silver: 1, bronze: 0 }),
    row({ nation_slug: "b", nation_name: "B", gold: 2, silver: 1, bronze: 0 }),
    row({ nation_slug: "c", nation_name: "C", gold: 1, silver: 0, bronze: 0 }),
  ]);
  assert.deepEqual(medalRanks(sorted), [1, 1, 3]);
});

test("medalRanks: three-way tie at the top, next row is rank 4", () => {
  const sorted = sortMedalTally([
    row({ nation_slug: "a", nation_name: "A", gold: 1, silver: 0, bronze: 0 }),
    row({ nation_slug: "b", nation_name: "B", gold: 1, silver: 0, bronze: 0 }),
    row({ nation_slug: "c", nation_name: "C", gold: 1, silver: 0, bronze: 0 }),
    row({ nation_slug: "d", nation_name: "D", gold: 0, silver: 5, bronze: 0 }),
  ]);
  assert.deepEqual(medalRanks(sorted), [1, 1, 1, 4]);
});

test("does not mutate the input array", () => {
  const rows = [row({ nation_slug: "b", gold: 1 }), row({ nation_slug: "a", gold: 2 })];
  const original = [...rows];
  sortMedalTally(rows);
  assert.deepEqual(rows, original);
});
