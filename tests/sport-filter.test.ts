import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ALL_LEAGUES } from "../src/lib/leagues";
import { SPORT_PICKS } from "../src/lib/sportPicks";
import { comingSportCounts, hasAttr, liveSportCounts, SPORT_HUB, sportOfLeague, sportsPresent } from "../src/lib/sportFilter";
import { HomeTabs } from "../src/components/home/HomeTabs";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("every league files under one of the picker's seven sports, and every sport has a page to send people to", () => {
  for (const l of ALL_LEAGUES) assert.ok((SPORT_PICKS as readonly string[]).includes(sportOfLeague(l)), l);
  for (const s of SPORT_PICKS) assert.match(SPORT_HUB[s], /^\//);
  assert.equal(sportOfLeague("epl"), "football");
  assert.equal(sportOfLeague("seriea"), "football");
  assert.equal(sportOfLeague("mls"), "football");
  assert.equal(sportOfLeague("ucl"), "football");
  assert.equal(sportOfLeague("ipl"), "cricket");
  assert.equal(sportOfLeague("odi"), "cricket");
  assert.equal(sportOfLeague("nfl"), "nfl");
  assert.equal(sportOfLeague("mlb"), "mlb");
});

test("chip counts are the cards the panels draw: live cricket is capped at six like the list, tennis and F1 count once drawn", () => {
  const live = liveSportCounts({ liveGames: [{ league: "epl" }, { league: "seriea" }, { league: "nfl" }, { league: "ipl" }], liveCricket: Array(9).fill({}), liveTennis: [{}, {}] });
  assert.deepEqual(live, { football: 2, nfl: 1, cricket: 7, tennis: 2 });
  const coming = comingSportCounts({ upcomingGames: [{ league: "nba" }], nextCricket: [{}, {}], nextTennis: [], f1: {} });
  assert.deepEqual(coming, { nba: 1, cricket: 2, f1: 1 });
  assert.deepEqual(sportsPresent(live, coming), ["cricket", "football", "nfl", "nba", "tennis", "f1"]);
  assert.equal(hasAttr(["nfl", "nfl", "nba"]), "nfl nba");
});

test("the tabs show every card without scripts: data-filter starts at all and the chips are buttons", () => {
  const html = renderToStaticMarkup(
    createElement(HomeTabs, {
      initial: "live",
      liveCount: 5,
      live: createElement("p", null, "live cards"),
      coming: createElement("p", null, "fixtures"),
      sports: { live: { football: 4, nfl: 1 }, coming: { nba: 2 } },
    })
  );
  assert.match(html, /data-filter="all"/);
  assert.match(html, /role="group" aria-label="Show one sport"/);
  assert.match(html, /aria-pressed="true"[^>]*>All</);
  assert.match(html, />Football<b>4</);
  assert.match(html, />NFL<b>1</);
  // A sport with nothing in play yet has a chip (it has fixtures) but no count on the Live tab.
  assert.match(html, />NBA<\/button>/);
  assert.doesNotMatch(html, /See all|All Football live/);
});

test("a lone sport gets no chips, and without counts the tabs render as before", () => {
  const one = renderToStaticMarkup(createElement(HomeTabs, { initial: "live", liveCount: 1, live: createElement("p"), coming: createElement("p"), sports: { live: { cricket: 1 }, coming: {} } }));
  assert.doesNotMatch(one, /sport-chips/);
  const none = renderToStaticMarkup(createElement(HomeTabs, { initial: "coming", liveCount: 0, live: createElement("p"), coming: createElement("p") }));
  assert.doesNotMatch(none, /sport-chips/);
});

test("the lists tag every card with its sport and every grid with the sports it holds; the hide rules live in the stylesheet", () => {
  const src = read("src/components/HomeLive.tsx");
  assert.match(src, /data-sport=\{sportOfLeague\(g\.league\)\}/);
  assert.match(src, /data-has=\{hasAttr\(/);
  assert.match(src, /data-sport="cricket"/);
  assert.match(src, /data-sport="tennis"/);
  assert.match(src, /data-sport="f1"/);
  const css = read("src/app/globals.css");
  for (const s of SPORT_PICKS) {
    assert.ok(css.includes(`[data-filter="${s}"] [data-sport]:not([data-sport="${s}"])`), s);
    assert.ok(css.includes(`[data-filter="${s}"] [data-has]:not([data-has~="${s}"])`), s);
  }
});

test("the home page opens with Live now and Coming up under the hero, then Right now beside Try a name; the hero's in-play count jumps to them", () => {
  const page = read("src/app/page.tsx");
  assert.match(page, /<div className="home-firstvisit home-mods(?: motion-stagger)?">\s*<LiveTabs \/>\s*<div className="home-duo home-duo-wide">\s*<RightNow \/>\s*<TryAName \/>/);
  assert.match(read("src/components/home/RightNow.tsx"), /<section id="live"/);
  assert.match(read("src/components/home/SportPicker.tsx"), /href="#live"/);
});
