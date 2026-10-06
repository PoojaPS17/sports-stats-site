import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CricketPlayingXi } from "../src/components/CricketPlayingXi";
import { CricketMatchInfo } from "../src/components/CricketMatchInfo";
import { playingXi } from "../src/lib/cricketPlayingXi";

const summary = JSON.parse(readFileSync(new URL("./fixtures/espn-cricket-summary-1553790.json", import.meta.url), "utf8"));

test("a collapsed Playing XI is a closed details card whose summary carries the h2 and a Show label, with the lists still in the HTML", () => {
  const html = renderToStaticMarkup(createElement(CricketPlayingXi, { sides: playingXi(summary), collapsed: true }));
  assert.match(html, /^<details class="card/);
  assert.doesNotMatch(html, /<details[^>]*open/);
  assert.match(html, /<summary[^>]*>.*<h2[^>]*>Playing XI<\/h2>.*Show/);
  assert.match(html, /Captain \(c\) and wicketkeeper/);
  assert.equal((html.match(/<li/g) ?? []).length, 22);
  assert.match(html, /<h3[^>]*>[^<]*Khan Research Laboratories/);
  // the open form is unchanged
  assert.match(renderToStaticMarkup(createElement(CricketPlayingXi, { sides: playingXi(summary) })), /^<section/);
});

test("a collapsed Match info keeps its definition list inside a closed details card", () => {
  const props = { series: { name: "President's Trophy 2026-27", href: "/cricket/series/1553000" }, stage: "14th Match", format: "First-class", date: "2026-09-30T05:00:00Z", venue: "National Ground, Islamabad", officials: [{ name: "Imranullah Aslam", role: "umpire" }], playerOfTheMatch: null, result: "Match drawn" };
  const html = renderToStaticMarkup(createElement(CricketMatchInfo, { ...props, collapsed: true }));
  assert.match(html, /^<details class="card/);
  assert.match(html, /<summary[^>]*>.*<h2[^>]*>Match info<\/h2>.*Show/);
  assert.match(html, /<dt[^>]*>Venue<\/dt><dd[^>]*>National Ground, Islamabad/);
  assert.match(html, /<dt[^>]*>Result<\/dt><dd[^>]*>Match drawn/);
  assert.match(renderToStaticMarkup(createElement(CricketMatchInfo, props)), /^<section/);
});
