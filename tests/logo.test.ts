import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PixelBall, Wordmark } from "../src/components/Logo";

test("the mark is four blocks and only the top-right one is lit", () => {
  const html = renderToStaticMarkup(createElement(PixelBall, { size: 40, fill: "#ffffff", live: "#c6f135" }));
  assert.equal((html.match(/<rect /g) ?? []).length, 4);
  assert.match(html, /x="21" y="7" width="12" height="12" rx="3" fill="#c6f135"/);
  assert.equal((html.match(/#c6f135/g) ?? []).length, 1);
});

test("a background draws a tile behind an inset mark", () => {
  const html = renderToStaticMarkup(createElement(PixelBall, { size: 64, fill: "#ffffff", live: "#c6f135", background: "#0b1324", inset: 0.72 }));
  assert.equal((html.match(/<rect /g) ?? []).length, 5);
  assert.match(html, /<rect width="40" height="40" rx="8.8" fill="#0b1324"/);
  assert.match(html, /scale\(0.72\)/);
});

test("the wordmark sets DB in the signature colour", () => {
  const html = renderToStaticMarkup(createElement(Wordmark, {}));
  assert.match(html, /Sports<span class="text-\[var\(--sig\)\]">DB<\/span>/);
  assert.match(html, /class="display/);
});
