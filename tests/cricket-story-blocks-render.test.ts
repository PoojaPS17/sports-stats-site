import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { deriveMatchStory } from "../src/lib/cricketBalls";
import { keyMoments, parseMilestones } from "../src/lib/cricketMatchMoments";
import { CricketKeyMoments } from "../src/components/CricketKeyMoments";
import { CricketTopPerformers } from "../src/components/CricketTopPerformers";
import { CricketPartnerships } from "../src/components/CricketPartnerships";
import { CricketNextMatch } from "../src/components/CricketNextMatch";
import type { Performer } from "../src/lib/cricketPerformers";
import type { CricketSeriesMatch } from "../src/lib/cricketSeriesTypes";

const balls = JSON.parse(readFileSync(new URL("./fixtures/espn-cricket-playbyplay-1529230.json", import.meta.url), "utf8")) as unknown[];
const story = deriveMatchStory(balls);
const colours = { "4": "#790d1a", "6": "#050ceb" };
const teams = { "4": "West Indies", "6": "India" };

test("key moments: one list per innings under the batting side's name, wickets in the loss colour, milestones in the team colour, phases muted", () => {
  const milestones = parseMilestones([
    { type: "matchnote", text: "West Indies innings" },
    { type: "matchnote", text: "Powerplay 1: Overs 0.1 - 6.0 (Mandatory - 44 runs, 2 wickets)" },
    { type: "matchnote", text: "West Indies: 50 runs in 7.2 overs (46 balls), Extras 3" },
  ]);
  const html = renderToStaticMarkup(createElement(CricketKeyMoments, { moments: keyMoments(story, milestones), colours, teams }));
  assert.match(html, /Key moments/);
  assert.match(html, /West Indies innings/);
  assert.match(html, /India innings/);
  assert.equal((html.match(/<ol/g) ?? []).length, 2);
  assert.match(html, /Kamil Pooran b Arshdeep Singh 12 · 38\/1/);
  assert.match(html, /4\.3/);
  assert.equal((html.match(/bg-\[var\(--loss\)\]/g) ?? []).length, 12);
  assert.match(html, /background-color:#790d1a/);
  assert.match(html, /bg-\[var\(--border-strong\)\]/);
  assert.equal(renderToStaticMarkup(createElement(CricketKeyMoments, { moments: [], colours, teams })), "");
});

const large: Performer = { athleteId: "1352217", name: "Nishita Akter Nishi", teamId: "1336139", innings: 2, kind: "bowl", figure: "2/16", detail: "4 overs · econ 4.00" };
const small: Performer[] = [
  { athleteId: "1465119", name: "Sadia Akter", teamId: "1336139", innings: 1, kind: "bat", figure: "34*", detail: "25 balls · 1 four · 2 sixes · SR 136.00" },
  { athleteId: "1465108", name: "Mahnoor Zeb", teamId: "1336142", innings: 1, kind: "bowl", figure: "3/24", detail: "4 overs · econ 6.00" },
  { athleteId: "1465101", name: "Komal Khan", teamId: "1336142", innings: 2, kind: "bat", figure: "29", detail: "39 balls · 3 fours · SR 74.35" },
];

test("top performers: the large card in the accent colour, small cards in a grid, links only where a player page exists", () => {
  const html = renderToStaticMarkup(createElement(CricketTopPerformers, { large, small, league: "odi", playerSlugs: new Map([["1352217", "nishita-akter-nishi"]]), teams: { "1336139": "Bangladesh Women U19", "1336142": "Pakistan Women U19" } }));
  assert.match(html, /Top performers/);
  assert.match(html, /bg-\[var\(--sig\)\][^"]*text-\[var\(--sig-on\)\]/);
  assert.match(html, /2\/16/);
  assert.match(html, /href="\/odi\/players\/nishita-akter-nishi"/);
  assert.equal((html.match(/href="/g) ?? []).length, 1);
  assert.match(html, /Sadia Akter/);
  assert.match(html, /34\*/);
  assert.match(html, /Player of the Match/);
  assert.match(html, /Bangladesh Women U19/);
  assert.equal(renderToStaticMarkup(createElement(CricketTopPerformers, { large: null, small: [], league: "odi", playerSlugs: new Map(), teams: {} })), "");
});

test("partnerships: a column per innings, bars scaled to the biggest stand, the unbroken pair marked", () => {
  const html = renderToStaticMarkup(createElement(CricketPartnerships, { innings: story, colours }));
  assert.match(html, /Partnerships/);
  assert.match(html, /Shai Hope &amp; Sherfane Rutherford/);
  assert.match(html, /Shreyas Iyer &amp; Ishan Kishan/);
  assert.match(html, /width:100%/);
  assert.match(html, /width:46%/);
  assert.match(html, /unbroken/);
  assert.equal((html.match(/<li/g) ?? []).length, 13);
  assert.match(html, /background-color:#050ceb/);
  assert.equal(renderToStaticMarkup(createElement(CricketPartnerships, { innings: story.map((i) => ({ ...i, partnerships: [] })), colours })), "");
});

const next: CricketSeriesMatch = {
  espn_id: "1529231",
  series_espn_id: "8669",
  series_name: "West Indies tour of India 2026/27",
  series_kind: "international",
  date: "2026-10-08T13:30:00Z",
  name: "India v West Indies",
  short_name: "IND v WI",
  description: "2nd T20I",
  class_card: "T20I",
  international_class_id: "3",
  status_state: "pre",
  status_summary: null,
  venue: "Barsapara Cricket Stadium, Guwahati",
  home: { id: "6", name: "India", abbreviation: "IND", score: null, winner: false, logo: null },
  away: { id: "4", name: "West Indies", abbreviation: "WI", score: null, winner: false, logo: null },
  scorecard_league: null,
};

test("next in this series: the next fixture with its stage and the series page, or nothing", () => {
  const html = renderToStaticMarkup(createElement(CricketNextMatch, { next, series: { name: next.series_name, href: "/cricket/series/8669" }, seriesNote: "India lead the 5-match series 1-0" }));
  assert.match(html, /Next in this series/);
  assert.match(html, /href="\/cricket\/matches\/1529231"/);
  assert.match(html, /2nd T20I/);
  assert.match(html, /India lead the 5-match series 1-0/);
  assert.match(html, /href="\/cricket\/series\/8669"/);
  assert.match(html, /<time/);
  assert.equal(renderToStaticMarkup(createElement(CricketNextMatch, { next: null, series: { name: "x", href: "/cricket/series/1" }, seriesNote: null })), "");
});
