import { test } from "node:test";
import assert from "node:assert/strict";
import { colourForWhiteText, whiteContrast } from "../src/lib/teamColor";

test("a colour white text already reads on is returned unchanged", () => {
  assert.equal(colourForWhiteText("8b1e3f"), "#8b1e3f");
  assert.equal(colourForWhiteText("#0E7490"), "#0e7490");
});

test("a pale colour is darkened until white text reads at 4.5:1, and keeps its hue", () => {
  for (const pale of ["ffd700", "f5e50b", "a9c4e4", "ffffff", "c6f135"]) {
    const out = colourForWhiteText(pale);
    assert.ok(whiteContrast(out) >= 4.5, `${pale} -> ${out}`);
    assert.match(out, /^#[0-9a-f]{6}$/);
  }
  const yellow = colourForWhiteText("ffd700");
  assert.ok(parseInt(yellow.slice(1, 3), 16) >= parseInt(yellow.slice(5, 7), 16), "still a warm colour, not grey-blue");
});

test("no colour, or a bad one, gives the brand blue", () => {
  assert.equal(colourForWhiteText(null), "#1470af");
  assert.equal(colourForWhiteText("not-a-colour"), "#1470af");
});

import { ordinal } from "../src/lib/ordinal";

test("ordinals: the teens are all th, the rest follow the last digit", () => {
  assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 111, 112, 120].map(ordinal), ["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "23rd", "101st", "111th", "112th", "120th"]);
});
