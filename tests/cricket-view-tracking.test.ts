import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { CRICKET_VIEW_LEAGUE } from "../src/lib/viewLeague";

const read = (rel: string) => readFileSync(fileURLToPath(new URL(`../${rel}`, import.meta.url)), "utf8");

test("the cricket match page, which both routes share, counts a view under the cricket marker", () => {
  assert.equal(CRICKET_VIEW_LEAGUE, "cricket");
  assert.match(read("src/lib/cricketMatchPage.tsx"), /<ViewTracker league=\{CRICKET_VIEW_LEAGUE\} gameId=\{id\} \/>/);
});

test("the view endpoint accepts the cricket marker as well as a league", () => {
  assert.match(read("src/app/api/track-view/route.ts"), /isLeague\(league\) \|\| league === CRICKET_VIEW_LEAGUE/);
});

test("top games shows view counts as numbers", () => {
  assert.match(read("src/lib/queries.ts"), /views: Number\(r\.views\)/, "count(*) arrives as a string; 1 must read '1 view', not '1 views'");
});

test("top games is a thin, filterable page: noindex and out of the sitemap", () => {
  assert.match(read("src/app/top-games/page.tsx"), /noindex: true/);
  assert.doesNotMatch(read("src/lib/sitemap.ts"), /\/top-games/);
});
