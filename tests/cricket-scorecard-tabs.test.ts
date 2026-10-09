import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { deriveMatchStory } from "../src/lib/cricketBalls";
import type { CricketTeamScorecard } from "../src/lib/matchDetail";
import { scorecardTabs } from "../src/lib/cricketScorecardView";
import { CricketScorecardTabs } from "../src/components/CricketScorecardTabs";
import { CricketScorecardPanel } from "../src/components/CricketScorecardPanel";

const balls = JSON.parse(readFileSync(new URL("./fixtures/espn-cricket-playbyplay-1529230.json", import.meta.url), "utf8")) as unknown[];
const story = deriveMatchStory(balls);
const bat = (name: string, id: string, runs: number, sr: string, innings: number, dismissal = "not out") => ({ name, athleteId: id, stats: [String(runs), "30", "2", "1", sr], innings, position: 1, dismissal });
const bowl = (name: string, id: string, econ: string, innings: number) => ({ name, athleteId: id, stats: ["4", "0", "30", "2", econ], innings, position: 1, dismissal: null });
const scorecard: CricketTeamScorecard[] = [
  { teamId: "4", teamName: "West Indies", battingLabels: ["R", "B", "4s", "6s", "SR"], battingRows: [bat("Shai Hope", "h", 52, "100.00", 1, "c Axar Patel b Naman Dhir")], bowlingLabels: ["O", "M", "R", "W", "Econ"], bowlingRows: [bowl("Akeal Hosein", "ah", "7.50", 2), bowl("Romario Shepherd", "rs", "12.00", 2)], innings: [{ period: 1, runs: 171, wickets: 10, overs: 19.1, description: "all out" }] },
  { teamId: "6", teamName: "India", battingLabels: ["R", "B", "4s", "6s", "SR"], battingRows: [bat("Shreyas Iyer", "si", 102, "237.20", 2), bat("Ishan Kishan", "ik", 50, "150.00", 2)], bowlingLabels: ["O", "M", "R", "W", "Econ"], bowlingRows: [bowl("Arshdeep Singh", "as", "7.00", 1)], innings: [{ period: 2, runs: 172, wickets: 2, overs: 14.4, description: "target reached" }] },
];
const tabs = scorecardTabs(scorecard, story, { "4": "#790d1a", "6": "#050ceb" });

test("the tabs: one pill per innings with the side's colour dot, the first pressed, every panel in the HTML and the others hidden", () => {
  const html = renderToStaticMarkup(createElement(CricketScorecardTabs, { tabs: tabs.map((t) => ({ key: t.key, label: t.label, colour: t.colour, panel: createElement("p", null, `panel ${t.key}`) })) }));
  assert.match(html, /role="tablist"/);
  assert.equal((html.match(/<button/g) ?? []).length, 2);
  assert.match(html, /aria-selected="true"[^>]*>.*West Indies · 171 all out \(19\.1 ov\)/);
  assert.match(html, /background-color:#790d1a/);
  assert.match(html, /data-innings="1"/);
  assert.match(html, /data-innings="2"[^>]*hidden=""/);
  assert.equal((html.match(/hidden=""/g) ?? []).length, 1);
  assert.match(html, /panel 1/);
  assert.match(html, /panel 2/);
});

test("the tabs are a tablist: role=tab with aria-selected and aria-controls, each panel a tabpanel labelled by its tab", () => {
  const html = renderToStaticMarkup(createElement(CricketScorecardTabs, { tabs: tabs.map((t) => ({ key: t.key, label: t.label, colour: t.colour, panel: createElement("p", null, `panel ${t.key}`) })) }));
  assert.doesNotMatch(html, /aria-pressed/);
  const tabEls = [...html.matchAll(/<button[^>]*>/g)].map((m) => m[0]);
  assert.equal(tabEls.length, 2);
  assert.ok(tabEls.every((b) => /role="tab"/.test(b)));
  assert.match(tabEls[0], /aria-selected="true"/);
  assert.match(tabEls[1], /aria-selected="false"/);
  const panelEls = [...html.matchAll(/<div[^>]*role="tabpanel"[^>]*>/g)].map((m) => m[0]);
  assert.equal(panelEls.length, 2);
  tabEls.forEach((b, i) => {
    const id = b.match(/ id="([^"]+)"/)?.[1];
    const controls = b.match(/aria-controls="([^"]+)"/)?.[1];
    assert.ok(id && controls);
    assert.match(panelEls[i], new RegExp(` id="${controls}"`));
    assert.match(panelEls[i], new RegExp(`aria-labelledby="${id}"`));
  });
});

test("a panel: batting with strike-rate bars, extras and total rows, bowling with economy bars and the fall of wickets, player links where known", () => {
  const html = renderToStaticMarkup(createElement(CricketScorecardPanel, { tab: tabs[0], league: "odi", playerSlugs: new Map([["h", "shai-hope"]]) }));
  assert.match(html, /href="\/odi\/players\/shai-hope"/);
  assert.equal((html.match(/href="/g) ?? []).length, 1);
  assert.match(html, /c Axar Patel b Naman Dhir/);
  // SR 100 of 250 = 40% in the side's colour
  assert.match(html, /width:40%;background-color:#790d1a/);
  assert.match(html, /<tfoot/);
  assert.match(html, /Extras<\/t[dh]>[^]*?119 \(b \d+, lb \d+, w \d+, nb \d+\)/);
  assert.match(html, /Total<\/t[dh]>[^]*?171 all out · 19\.1 overs · run rate 8\.92/);
  // the bowling card keeps the panel's colour: Arshdeep's 7.00 of 20 = 35%
  assert.match(html, /width:35%;background-color:#790d1a/);
  assert.match(html, /Fall of wickets/);
  assert.match(html, /1-38 Pooran \(4\.3\), 2-44 Hetmyer \(5\.2\)/);
  assert.match(html, /Bowling · India/);
  // the second innings: Hosein's 7.50 is 37.5% in India's colour; Shepherd's 12.00 is expensive, 60% in the loss colour
  const second = renderToStaticMarkup(createElement(CricketScorecardPanel, { tab: tabs[1], league: "odi", playerSlugs: new Map() }));
  assert.match(second, /width:37\.5%;background-color:#050ceb/);
  assert.match(second, /bg-\[var\(--loss\)\][^>]*style="width:60%/);
  assert.match(second, /1-29 Sharma \(2\.3\), 2-35 Samson \(3\.3\)/);
});

test("a panel without a ball-by-ball shows the extras total alone and no fall of wickets", () => {
  const [tab] = scorecardTabs(scorecard, [], {});
  const html = renderToStaticMarkup(createElement(CricketScorecardPanel, { tab, league: "odi", playerSlugs: new Map() }));
  assert.match(html, /Extras<\/t[dh]>[^]*?119</);
  assert.doesNotMatch(html, /Fall of wickets/);
  assert.doesNotMatch(html, /background-color:/);
  assert.match(html, /bg-\[var\(--sig-soft\)\]/);
});
