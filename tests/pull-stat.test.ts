import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PullStat } from "../src/components/PullStat";

test("a pull stat renders its value, unit and caption", () => {
  const html = renderToStaticMarkup(createElement(PullStat, { value: "9", unit: "of 10", caption: "Men's golds since 1990" }));
  assert.match(html, />9</);
  assert.match(html, /of 10/);
  assert.match(html, /Men(&#x27;|')s golds since 1990/);
});
