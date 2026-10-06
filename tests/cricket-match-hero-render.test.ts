import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CricketMatchHero, type CricketMatchHeroProps } from "../src/components/CricketMatchHero";

const base: CricketMatchHeroProps = {
  state: "post",
  calledOff: null,
  headline: "India vs West Indies · 1st T20I · West Indies tour of India 2026/27",
  date: "2026-10-06T13:30Z",
  sides: [
    { name: "India", score: "172/2 (14.4/20 ov, target 172)", winner: true, logo: null, colour: "#050ceb" },
    { name: "West Indies", score: "171", winner: false, logo: null, colour: "#790d1a" },
  ],
  result: "India won by 8 wkts (32b rem)",
  potm: { name: "Shreyas Iyer", line: "102* (43)" },
  pills: ["Toss: India, elected to field first", "T20I no. 4166"],
  liveLine: null,
  venue: null,
};

test("a result: band-deep card, the h1 line kept, display scores split, result line, potm chip, pills, team colour bars", () => {
  const html = renderToStaticMarkup(createElement(CricketMatchHero, base));
  assert.match(html, /class="band-deep/);
  assert.match(html, /<h1[^>]*>India vs West Indies · 1st T20I · West Indies tour of India 2026\/27<\/h1>/);
  assert.match(html, />Result</);
  assert.match(html, /class="display[^"]*"[^>]*>172\/2</);
  assert.match(html, /14\.4\/20 ov, target 172/);
  assert.match(html, /India won by 8 wkts \(32b rem\)/);
  assert.match(html, /Player of the Match/);
  assert.match(html, /Shreyas Iyer/);
  assert.match(html, /102\* \(43\)/);
  assert.match(html, /Toss: India, elected to field first/);
  assert.match(html, /border-color:#050ceb/);
  assert.match(html, /border-color:#790d1a/);
});

test("a live match shows the live pill and the rate line, no result", () => {
  const html = renderToStaticMarkup(createElement(CricketMatchHero, { ...base, state: "in", result: null, potm: null, liveLine: "Run rate 11.72 · required 8.40" }));
  assert.match(html, /pill-live/);
  assert.match(html, /Run rate 11\.72 · required 8\.40/);
  assert.doesNotMatch(html, /won by/);
});

test("a fixture shows Upcoming and the ground; a called-off match says why; no colour means the band hairline", () => {
  const pre = renderToStaticMarkup(
    createElement(CricketMatchHero, {
      ...base,
      state: "pre",
      result: null,
      potm: null,
      venue: "Ekana Cricket Stadium, Lucknow",
      sides: [
        { ...base.sides[0], score: "", colour: null },
        { ...base.sides[1], score: "", colour: null },
      ],
    })
  );
  assert.match(pre, /Upcoming/);
  assert.match(pre, /Ekana Cricket Stadium, Lucknow/);
  assert.match(pre, /border-color:var\(--mast-line\)/);
  assert.doesNotMatch(pre, /class="display/);
  const off = renderToStaticMarkup(createElement(CricketMatchHero, { ...base, calledOff: "Abandoned", result: null }));
  assert.match(off, />Abandoned</);
});

test("a two-innings score steps the display size down so the name keeps its room", () => {
  const html = renderToStaticMarkup(
    createElement(CricketMatchHero, {
      ...base,
      sides: [
        { ...base.sides[0], score: "327", winner: false },
        { ...base.sides[1], score: "311 & 372/6 (117 ov)", winner: false },
      ],
    })
  );
  assert.match(html, /class="display[^"]*text-\[44px\][^"]*"[^>]*>327</);
  assert.match(html, /class="display[^"]*text-\[30px\][^"]*"[^>]*>311 &amp; 372\/6</);
});
