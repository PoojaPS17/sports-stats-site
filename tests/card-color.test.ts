import { test } from "node:test";
import assert from "node:assert/strict";
import { cardAccentColor } from "../src/lib/cardColor";
import { CARD } from "../src/lib/exportTheme";

test("a missing team color falls back to the card accent", () => {
  assert.equal(cardAccentColor(null), CARD.accent);
});

test("a normal dark team color is used as-is, normalized to a leading #", () => {
  assert.equal(cardAccentColor("1d428a"), "#1d428a");
  assert.equal(cardAccentColor("#1d428a"), "#1d428a");
});

test("a team color too close to the white card surface falls back to the card accent", () => {
  // Golden State's pale gold and a plain white both fail a 3:1 contrast check against CARD.surface (#ffffff).
  assert.equal(cardAccentColor("ffc72c"), CARD.accent);
  assert.equal(cardAccentColor("ffffff"), CARD.accent);
});

test("a mid-tone team color that does pass 3:1 is kept", () => {
  // A saturated blue comfortably clears 3:1 against white.
  assert.equal(cardAccentColor("0057b8"), "#0057b8");
});
