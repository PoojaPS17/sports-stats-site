import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CricketCareer } from "../src/components/CricketCareer";
import { splitFromQuery } from "../src/components/CricketSplitTabs";
import type { CricketCareerStats, CricketSplitRow } from "../src/lib/queries";

// The cricket career splits used to be three URLs (?split=team, ?split=opponent, ?split=venue), read
// from searchParams on the server. That one read made every player page in every league render on
// demand. They are tabs in a single page now: all three tables are in the HTML, so a crawler that
// follows an old ?split= link still finds the figures that link was for, and the bare player page is
// the only address.

const career: CricketCareerStats = {
  matches: 12,
  inningsBatted: 11,
  runs: 430,
  ballsFaced: 300,
  notOuts: 2,
  hundreds: 1,
  fifties: 3,
  highestScore: 104,
  average: 47.77,
  strikeRate: 143.3,
  inningsBowled: 4,
  overs: 8.2,
  runsConceded: 70,
  wickets: 3,
  economy: 8.4,
  fiveWicketHauls: 0,
  catches: 5,
};

const row = (key: string, label: string): CricketSplitRow => ({ key, label, slug: null, matches: 4, runs: 140, wickets: 1 });

const splits = {
  team: [row("t1", "Mumbai Indians")],
  opponent: [row("o1", "Chennai Super Kings")],
  venue: [row("v1", "Wankhede Stadium")],
};

function markup(): string {
  return renderToStaticMarkup(createElement(CricketCareer, { league: "ipl" as const, career, splits }));
}

test("an old ?split= value picks its tab, and anything else falls back to the first one", () => {
  const keys = ["team", "opponent", "venue"];
  assert.equal(splitFromQuery("?split=opponent", keys), "opponent");
  assert.equal(splitFromQuery("?split=venue&utm_source=x", keys), "venue");
  assert.equal(splitFromQuery("?split=team", keys), "team");
  // Exactly what the server did with a value it did not know: show the first split.
  assert.equal(splitFromQuery("?split=bowling", keys), "team");
  assert.equal(splitFromQuery("?split=", keys), "team");
  assert.equal(splitFromQuery("", keys), "team");
  assert.equal(splitFromQuery("?other=1", keys), "team");
});

test("every split is in the server-rendered HTML, whichever one the visitor asked for", () => {
  const html = markup();
  for (const label of ["Mumbai Indians", "Chennai Super Kings", "Wankhede Stadium"]) {
    assert.ok(html.includes(label), `the HTML holds the ${label} split row`);
  }
  for (const tab of ["By Team", "By Opponent", "By Venue"]) {
    assert.ok(html.includes(tab), `the HTML offers the ${tab} tab`);
  }
});

test("only the first split is on show before the visitor picks another", () => {
  const html = markup();
  const panels = [...html.matchAll(/data-split="([a-z]+)"([^>]*)>/g)].map((m) => ({ key: m[1], hidden: /\bhidden\b/.test(m[2]) }));
  assert.deepEqual(
    panels.map((p) => p.key),
    ["team", "opponent", "venue"]
  );
  assert.deepEqual(
    panels.filter((p) => !p.hidden).map((p) => p.key),
    ["team"]
  );
});

test("the splits are no longer separate addresses to crawl", () => {
  assert.doesNotMatch(markup(), /href="[^"]*split=/);
});

/** The career tiles as rendered, in order: [label, value]. */
function careerTiles(html: string): [string, string][] {
  return [...html.matchAll(/<p class="text-lg font-extrabold tabular-nums">([^<]*)<\/p><p class="[^"]*">([^<]*)<\/p>/g)].map((m) => [m[2].replace(/&amp;/g, "&"), m[1]]);
}

// Every figure the career block shows, for the fixture above. Averages and rates are derived in the
// component, so these pin the arithmetic as well as the plumbing: batting average 430/(11-2),
// bowling average 70/3, economy 70 runs over 8.2 overs.
const CAREER = [
  ["Matches", "12"],
  ["Innings", "11"],
  ["Runs", "430"],
  ["Highest", "104"],
  ["Average", "47.77"],
  ["Strike Rate", "143.3"],
  ["100s", "1"],
  ["50s", "3"],
  ["Innings", "4"],
  ["Overs", "8.2"],
  ["Wickets", "3"],
  ["Average", "23.33"],
  ["Economy", "8.40"],
  ["5w", "0"],
  ["Catches & stumpings", "5"],
];

test("the career figures are exactly the ones the data gives", () => {
  assert.deepEqual(careerTiles(markup()), CAREER);
});

test("no tab can change the career figures: they are rendered once, outside every panel", () => {
  const html = markup();
  const firstPanel = html.indexOf("data-split=");
  assert.ok(firstPanel > 0, "the panels are in the markup");
  // Same figures whichever split a visitor came for, because the block sits above the tabs and the
  // server render does not read the query at all.
  assert.deepEqual(careerTiles(html.slice(0, firstPanel)), CAREER);
  assert.deepEqual(careerTiles(html.slice(firstPanel)), []);
});

test("each split panel carries its own row's figures", () => {
  const html = markup();
  const panels = html.split(/(?=<div data-split=")/).filter((s) => s.startsWith("<div data-split="));
  assert.equal(panels.length, 3);
  for (const [i, key] of ["team", "opponent", "venue"].entries()) {
    const row = splits[key as keyof typeof splits][0];
    assert.match(panels[i], new RegExp(`data-split="${key}"`));
    const figures = [...panels[i].matchAll(/tabular-nums[^>]*">([^<]*)<\/td>/g)].map((m) => m[1]);
    assert.deepEqual(figures, [String(row.matches), String(row.runs), String(row.wickets)], `${key} panel figures`);
    assert.ok(panels[i].includes(row.label), `${key} panel names ${row.label}`);
  }
});

// What the site holds decides what the career figures can say. Cricsheet's ball-by-ball ODI archive starts in
// 2002 and its T20I archive in 2005; ESPN fills what Cricsheet lacks from 2009; the women's internationals and
// the Tests (since 2015) are ESPN's alone. Some matches neither source has are missing, so the note may not claim
// "every match on record" and may state only the years the data supports (for the ODI note: 2002 where the
// archive starts, 2008 where the missing span ends, 2009 where ESPN's gap fill begins).
const CRICKET_LEAGUES = ["test", "odi", "t20i", "wodi", "wt20i", "ipl", "bbl", "wpl", "wbbl", "cwc", "t20wc", "wcwc", "wt20wc"] as const;
const SUPPORTED_YEARS: Record<string, string[]> = { test: ["2015"], odi: ["2002", "2008", "2009"], t20i: ["2005"], wodi: ["2009"], wt20i: ["2009"] };
const noteOf = (league: (typeof CRICKET_LEAGUES)[number]) => {
  const html = renderToStaticMarkup(createElement(CricketCareer, { league, career, splits }));
  const note = html.match(/<p class="-mt-2 mb-3[^>]*>([\s\S]*?)<\/p>/)?.[1];
  assert.ok(note, `${league} has a career note`);
  return note.replace(/&#x27;/g, "'").replace(/&amp;/g, "&");
};

test("the career note counts the matches held on this site and says Matches counts the XI, for every league", () => {
  for (const league of CRICKET_LEAGUES) {
    const note = noteOf(league);
    assert.ok(note.includes("held on this site") || note.includes("without a scorecard"), `${league}: says the figures are of what this site holds`);
    assert.ok(note.includes("Matches counts every match on this site the player was in the playing XI for."), `${league}: Matches sentence`);
    assert.match(note, /lower than Cricinfo's/, `${league}: totals can be lower than Cricinfo's`);
    assert.doesNotMatch(note, /on record|From every|every game the player/, `${league}: no claim of full coverage`);
    assert.doesNotMatch(note, /batted, bowled or took a catch/);
  }
});

test("the career note states only the years the data supports, and no other year", () => {
  for (const league of CRICKET_LEAGUES) {
    const years = [...new Set(noteOf(league).match(/\b(19|20)\d\d\b/g) ?? [])].sort();
    assert.deepEqual(years, (SUPPORTED_YEARS[league] ?? []).sort(), `${league} note years`);
    assert.doesNotMatch(noteOf(league), /onward/, `${league}: no "onward" claim`);
  }
});

test("each league type says what is missing", () => {
  assert.match(noteOf("odi"), /Some ODIs from 2002 to 2008 and a few later ones are missing/);
  assert.match(noteOf("t20i"), /small number of matches are missing/);
  assert.match(noteOf("wodi"), /earlier matches are not included/);
  assert.match(noteOf("wt20i"), /small number of later matches are missing/);
  assert.match(noteOf("test"), /Tests before 2015 are not included/);
  for (const league of ["ipl", "bbl", "wpl", "wbbl", "cwc", "t20wc", "wcwc", "wt20wc"] as const) assert.match(noteOf(league), /Matches without a scorecard on this site are not counted/, league);
});
