import { test } from "node:test";
import assert from "node:assert/strict";
import { editionFor, editionNote, editionToggleLabel, startingBlocks, type EditionContext } from "../src/lib/editions";
import { validateBlockParams } from "../src/lib/blockParams";

const ctx: EditionContext = {
  cricketSides: [
    { id: "6", name: "India" },
    { id: "1", name: "England" },
    { id: "2", name: "Australia" },
  ],
  featuredCricketSeries: { id: "8604-2026", name: "ICC Men's T20 World Cup" },
};

test("countries map to their edition; unknown and null map to World", () => {
  assert.equal(editionFor("IN").name, "India");
  assert.equal(editionFor("in").name, "India");
  assert.equal(editionFor("US").name, "USA");
  assert.equal(editionFor("GB").nationalSide, "England");
  assert.equal(editionFor("DE").domesticLeague, "bundesliga");
  assert.equal(editionFor("BR").key, "world");
  assert.equal(editionFor(null).key, "world");
});

test("India starts with cricket, the national side, the featured series, the Premier League, F1 and the desk", () => {
  const labels = startingBlocks(editionFor("IN"), ctx).map((b) => b.label);
  assert.deepEqual(labels, [
    "Live in your blocks",
    "India: next three",
    "ICC Men's T20 World Cup standings",
    "Premier League standings",
    "F1: driver standings",
    "Beyond the Scoreline",
  ]);
});

test("a national side or featured series missing from the context is left out, never guessed", () => {
  const labels = startingBlocks(editionFor("PK"), { cricketSides: [], featuredCricketSeries: null }).map((b) => b.label);
  assert.deepEqual(labels, ["Live in your blocks", "Premier League standings", "F1: driver standings", "Beyond the Scoreline"]);
});

test("USA starts with the NFL, NBA and MLB, Germany with the Bundesliga, World with football", () => {
  assert.deepEqual(startingBlocks(editionFor("US"), ctx).map((b) => b.label), [
    "Live in your blocks",
    "NFL standings",
    "NBA standings",
    "MLB standings",
    "MLS standings",
    "Premier League standings",
    "Champions League standings",
    "Beyond the Scoreline",
  ]);
  assert.equal(startingBlocks(editionFor("DE"), ctx)[1].label, "Bundesliga standings");
  assert.deepEqual(startingBlocks(editionFor(null), ctx).map((b) => b.label), [
    "Live in your blocks",
    "Premier League standings",
    "Champions League standings",
    "F1: driver standings",
    "Beyond the Scoreline",
  ]);
});

test("every starting block of every edition is valid, uniquely identified and within the limit", () => {
  for (const country of ["IN", "PK", "BD", "LK", "US", "CA", "GB", "IE", "AU", "NZ", "ZA", "DE", "ES", "IT", null]) {
    const blocks = startingBlocks(editionFor(country), ctx);
    assert.ok(blocks.length <= 12);
    assert.equal(new Set(blocks.map((b) => b.id)).size, blocks.length);
    for (const b of blocks) assert.equal(validateBlockParams(b.type, b.params).ok, true, `${country}: ${b.id}`);
  }
});

test("the card copy names the edition, and World gets neutral copy", () => {
  assert.equal(editionNote(editionFor("IN")), "India picks, because that is where you are browsing from. Keep them, trim them, or start blank.");
  assert.equal(editionToggleLabel(editionFor("IN")), "Start with India picks");
  assert.equal(editionNote(editionFor(null)), "A starting set of picks. Keep them, trim them, or start blank.");
  assert.equal(editionToggleLabel(editionFor(null)), "Start with suggested picks");
});
