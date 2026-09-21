// Final review, Minor 5: one cricket matchup was named two ways on one match page. The heading, breadcrumb and title said
// "Mumbai vs Chennai" (home side first, `gameSides`) while the head-to-head link, the share titles, the export-card contexts
// and the Follow label said "Chennai vs Mumbai" (`matchupLabel`, which read the narrower football-only rule). A matchup is
// named one way; only a score line has its own order (batting first in cricket, `scoreLineSides`).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gameSides, matchupLabel } from "../src/lib/gamePage";
import { CRICKET_LEAGUES, type League } from "../src/lib/leagues";

const game = { home_name: "Mumbai", away_name: "Chennai" };
const src = (path: string) => readFileSync(path, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

test("a cricket matchup is named home side first, as the page's title names it", () => {
  for (const league of CRICKET_LEAGUES) assert.equal(matchupLabel(league, game), "Mumbai vs Chennai", league);
});

test("football, the NBA and the NFL name their matchups as they did", () => {
  assert.equal(matchupLabel("epl", game), "Mumbai vs Chennai");
  assert.equal(matchupLabel("ucl", game), "Mumbai vs Chennai");
  assert.equal(matchupLabel("nba", game), "Chennai vs Mumbai");
  assert.equal(matchupLabel("nfl", game), "Chennai vs Mumbai");
});

test("matchupLabel agrees with gameSides, the rule the title and heading use, in every league", () => {
  for (const league of ["nba", "nfl", "epl", "laliga", "bundesliga", "seriea", "ucl", ...CRICKET_LEAGUES] as League[]) {
    const { first, second } = gameSides(league, game);
    assert.equal(matchupLabel(league, game), `${first} vs ${second}`, league);
  }
});

test("the match page's heading and the header's Follow label take the matchup name from matchupLabel, not their own ordering", () => {
  const page = src("src/app/[league]/games/[id]/page.tsx");
  assert.match(page, /const matchName = matchupLabel\(league, game\)/);
  assert.doesNotMatch(page, /const awayFirst = league ===/);
  const header = src("src/components/MatchHeader.tsx");
  assert.match(header, /const matchLabel = matchupLabel\(league, game\)/);
  assert.doesNotMatch(header, /matchLabel = homeFirst/);
});
