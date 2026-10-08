import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { HomeCricket } from "../src/components/HomeCricket";
import { OffSeasonList } from "../src/components/ScoresBlocks";
import { ScoresFilter } from "../src/components/ScoresFilter";
import { LiveNowList, ComingUpList, hasComingUp } from "../src/components/HomeLive";
import type { HomeData } from "../src/lib/homeData";

// /scores holds the live and league content the home page no longer carries.
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("the page has Live now, Coming up, the cricket block, league blocks and the between-seasons list, and caches like the home page", () => {
  const src = read("src/app/scores/page.tsx");
  assert.match(src, /export const revalidate = 10;/);
  assert.match(src, /Live now/);
  assert.match(src, /Coming up/);
  assert.match(src, /<HomeCricket/);
  assert.match(src, /<LeagueBlock/);
  assert.match(src, /<OffSeasonList/);
  assert.match(src, /absoluteUrl\("\/scores"\)/);
  assert.match(src, /title: "Live scores and fixtures"/);
  assert.doesNotMatch(src, /NewsCard|StoryCard|searchParams|cookies\(|headers\(/);
});

test("the home page does not fetch or draw the per-league blocks", () => {
  const page = read("src/app/page.tsx");
  assert.doesNotMatch(page, /LeagueBlock|HomeCricket|LeagueSnapshot|scoresData|getScoresData|HomeLive\b/);
  const data = read("src/lib/homeData.ts");
  assert.doesNotMatch(data, /getOffseasonRecap|getCricketSeriesInProgressOther|getNews\(|snapshotFromRecap/);
  assert.match(read("src/lib/scoresData.ts"), /getCricketSeriesInProgressOther\(/);
  assert.match(read("src/lib/scoresData.ts"), /snapshotFromRecap\(/);
});

test("the league filter is a set of links that work without JavaScript, one chip per block, plus All", () => {
  const html = renderToStaticMarkup(createElement(ScoresFilter, { items: [{ key: "epl", label: "Premier League" }, { key: "cricket", label: "Cricket" }] }));
  assert.match(html, /href="#scores-top"[^>]*>All</);
  assert.match(html, /href="#scores-epl"[^>]*>Premier League</);
  assert.match(html, /href="#scores-cricket"[^>]*>Cricket</);
  assert.match(read("src/components/ScoresFilter.tsx"), /data-scores-block|dataset\.scoresBlock/);
  assert.match(read("src/components/ScoresBlocks.tsx"), /data-scores-block=\{league\}/);
});

test("HomeCricket links the domestic and women's series in progress", () => {
  const html = renderToStaticMarkup(createElement(HomeCricket, { live: 0, next: [], otherSeries: [{ espn_id: "1554058", name: "CSA Women Pro50 Series 2026/27", live: true }] }));
  assert.match(html, /Also in progress/);
  assert.match(html, /href="\/cricket\/series\/1554058"/);
  assert.doesNotMatch(renderToStaticMarkup(createElement(HomeCricket, { live: 0, next: [], otherSeries: [] })), /Also in progress/);
});

test("a league on a break names the day it resumes; one with nothing ahead is between seasons", () => {
  const html = renderToStaticMarkup(
    createElement(OffSeasonList, { items: [{ league: "epl", lastSeason: null, resumesOn: "2026-10-10T14:00:00.000Z" }, { league: "laliga", lastSeason: null, resumesOn: null }] })
  );
  assert.match(html, /The Premier League resumes Saturday, Oct 10/);
  assert.match(html, /La Liga is between seasons/);
  assert.equal(renderToStaticMarkup(createElement(OffSeasonList, { items: [] })), "");
});

test("empty lists render nothing and are reported as empty", () => {
  const empty = { liveGames: [], liveCricket: [], liveTennis: [], upcomingGames: [], nextCricket: [], nextTennis: [], f1: null } as unknown as HomeData;
  assert.equal(hasComingUp(empty), false);
  assert.doesNotMatch(renderToStaticMarkup(createElement(LiveNowList, { data: empty })), /<a /);
  assert.doesNotMatch(renderToStaticMarkup(createElement(ComingUpList, { data: empty })), /<a /);
});

test("All scores links go to /scores, and the page is in the sitemap", () => {
  assert.match(read("src/components/home/RightNow.tsx"), /label: "All scores", href: "\/scores"/);
  assert.doesNotMatch(read("src/components/home/RightNow.tsx"), /href: "#live"/);
  assert.match(read("src/components/Ticker.tsx"), /href="\/scores"[^>]*>\s*All scores/);
  assert.match(read("src/lib/sitemap.ts"), /entry\("\/scores"/);
});
