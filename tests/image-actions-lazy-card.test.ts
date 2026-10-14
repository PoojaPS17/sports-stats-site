import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../src/components/ImageActions.tsx", import.meta.url), "utf8");

// The export card used to render off-screen on every page load, so each table and fixture list was in the
// document twice (and the markup was the same size again in the Next payload). It must now only mount once
// the visitor reaches for a button.
test("the off-screen export card is not rendered until a button is touched", () => {
  assert.match(src, /\{card && armed && \(/);
  assert.doesNotMatch(src, /\{card && \(/);
});

test("hover, focus and touch arm the card, and capturing mounts it first", () => {
  assert.match(src, /onPointerEnter=\{arm\}/);
  assert.match(src, /onFocus=\{arm\}/);
  assert.match(src, /onTouchStart=\{arm\}/);
  const render = src.slice(src.indexOf("const render = async"), src.indexOf("function save"));
  assert.ok(render.indexOf("flushSync(() => setArmed(true))") < render.indexOf("toBlob("), "card must be mounted before it is captured");
});
