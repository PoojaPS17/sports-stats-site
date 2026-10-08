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

import { CARD_TEXT_OPACITY, whiteContrastAt } from "../src/lib/teamColor";

// Real ESPN team colours across leagues (red, green, gold, pale blue, white, near-black), as the home team card receives them.
const REAL_COLOURS = ["ef0107", "007a33", "fdb927", "ffc72c", "1d428a", "6cabdd", "132257", "ffffff", "fff200", "ffd700", "f5e50b", "c6f135", "a9c4e4", "0b2265", "ce1141", "00a3e0", "98002e", "241773", "311d00", "fb4f14", "e03a3e", "bbd1ea", "ffcd00", "00ff00", "ff69b4", "4f2683", "8a8d8f"];

test("the home card's small lines read at 4.5:1 on every team colour, at the lightest gradient stop and the faintest white", () => {
  for (const c of REAL_COLOURS) {
    const bg = colourForWhiteText(c, undefined, CARD_TEXT_OPACITY);
    assert.ok(whiteContrastAt(bg, CARD_TEXT_OPACITY) >= 4.5, `${c} -> ${bg}: ${whiteContrastAt(bg, CARD_TEXT_OPACITY).toFixed(2)}`);
    assert.ok(whiteContrastAt(bg, 0.9) >= 4.5, `${c} figure at 0.9`);
    assert.ok(whiteContrastAt(bg, 1) >= 4.5, `${c} full white`);
  }
});

test("a colour that already reads at the card's opacity is left as it is, so dark navy and purple cards do not change", () => {
  for (const c of ["132257", "241773", "0b2265", "311d00", "4f2683", "98002e"]) assert.equal(colourForWhiteText(c, undefined, CARD_TEXT_OPACITY), `#${c}`);
});

test("the form badges' white letters read at 4.5:1 on their backgrounds", () => {
  for (const bg of ["#15803d", "#dc2626", "#64748b"]) assert.ok(whiteContrast(bg) >= 4.5, `${bg}: ${whiteContrast(bg).toFixed(2)}`);
});

test("a sweep of colours across the whole range all reach 4.5:1 at the card's opacity", () => {
  for (let r = 0; r < 256; r += 51) {
    for (let g = 0; g < 256; g += 51) {
      for (let b = 0; b < 256; b += 51) {
        const hex = [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
        const bg = colourForWhiteText(hex, undefined, CARD_TEXT_OPACITY);
        assert.ok(whiteContrastAt(bg, CARD_TEXT_OPACITY) >= 4.5, `${hex} -> ${bg}`);
      }
    }
  }
});

import { ordinal } from "../src/lib/ordinal";

test("ordinals: the teens are all th, the rest follow the last digit", () => {
  assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 111, 112, 120].map(ordinal), ["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "23rd", "101st", "111th", "112th", "120th"]);
});
