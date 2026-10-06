import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { deriveMatchStory } from "../src/lib/cricketBalls";
import { CricketMatchStory } from "../src/components/CricketMatchStory";

const items = JSON.parse(readFileSync(new URL("./fixtures/espn-cricket-playbyplay-1529230.json", import.meta.url), "utf8")) as unknown[];
const innings = deriveMatchStory(items);

test("the story opens on the worm with both lines, the legend and the biggest over selected", () => {
  const html = renderToStaticMarkup(createElement(CricketMatchStory, { innings, colours: { "4": "#790d1a", "6": "#050ceb" } }));
  assert.match(html, /Match story/);
  assert.equal((html.match(/<polyline/g) ?? []).length, 2);
  assert.match(html, /stroke="#050ceb"/);
  assert.match(html, /aria-pressed="true"[^>]*>Run worm</);
  assert.match(html, /Over 14 · India · 24 runs/);
  assert.match(html, /India 164\/2 after 14 overs\./);
  assert.match(html, /Over 14 · West Indies · 9 runs, 1 wicket/);
  // 12 wicket markers on the worm, plus the legend's own marker is a span, not a circle
  assert.equal((html.match(/<circle/g) ?? []).length, 12);
  assert.match(html, /West Indies 171 all out/);
  assert.match(html, /India 172\/2/);
});

test("every over has a hit zone and the inspector lists the balls with their symbols", () => {
  const html = renderToStaticMarkup(createElement(CricketMatchStory, { innings, colours: {} }));
  assert.equal((html.match(/data-over="/g) ?? []).length, 20);
  assert.match(html, /aria-label="Over 14, India: 6, 6, 1, 1, 4, 6"/);
  assert.match(html, /aria-label="Over 14, West Indies: 6, W, 1, 1, 0, 1"/);
  // without ESPN colours the sides fall back to the site's tokens
  assert.match(html, /stroke="var\(--sig\)"/);
});

test("no innings renders nothing", () => {
  assert.equal(renderToStaticMarkup(createElement(CricketMatchStory, { innings: [], colours: {} })), "");
});

test("the inspector has previous and next over buttons so the chart is usable by keyboard and on a phone", () => {
  const html = renderToStaticMarkup(createElement(CricketMatchStory, { innings, colours: {} }));
  assert.match(html, /aria-label="Previous over"/);
  assert.match(html, /aria-label="Next over"/);
  assert.match(html, /Over 14 of 20/);
});
