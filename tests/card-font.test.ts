import { test } from "node:test";
import assert from "node:assert/strict";
import { CARD_FONTS } from "../src/lib/cardFont";

test("the card font bundle has a regular and a bold Inter weight, well under the ImageResponse 500KB ceiling", () => {
  assert.equal(CARD_FONTS.length, 2);
  const weights = CARD_FONTS.map((f) => f.weight).sort();
  assert.deepEqual(weights, [400, 700]);
  for (const f of CARD_FONTS) {
    assert.equal(f.name, "Inter");
    assert.equal(f.style, "normal");
    assert.ok(f.data.byteLength > 0, "font file must not be empty");
  }
  const total = CARD_FONTS.reduce((sum, f) => sum + f.data.byteLength, 0);
  assert.ok(total < 300_000, `combined font size ${total} bytes is too large for a 500KB ImageResponse budget shared with JSX/CSS`);
});
