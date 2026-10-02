// MLB as a league key: where it belongs in the site's lists, how its season is labelled and dated,
// and the US-sports surfaces (menus, editions, the block palette, the home feed, article art) that
// already carry the NBA and the NFL.
import test from "node:test";
import assert from "node:assert/strict";
import {
  ALL_LEAGUES,
  HISTORY_START,
  LEAGUE_LABEL,
  LEAGUE_SHORT,
  formatSeasonLabel,
  hasStandings,
  hasNewsFeed,
  hasTies,
  isCricketLeague,
  LEAGUES,
  isLeague,
  isSoccerLeague,
  leagueNameWithArticle,
  scheduleWords,
} from "../src/lib/leagues";
import { dayTimeZone, dayZoneLabel } from "../src/lib/gameDay";
import { ELO_PARAMS } from "../src/lib/analytics";
import { paletteForTags } from "../src/lib/articleArt";
import { startingBlocks } from "../src/lib/editions";
import { paletteGroups } from "../src/lib/blockCatalogue";
import { NAV_ITEMS } from "../src/lib/nav";

const EMPTY_CONTEXT = { cricketSides: [], featuredCricketSeries: null };

test("mlb is a league of the site, in ALL_LEAGUES and recognised by isLeague", () => {
  assert.ok(isLeague("mlb"));
  assert.ok(ALL_LEAGUES.includes("mlb"));
  assert.equal(LEAGUE_LABEL.mlb, "MLB");
  assert.equal(LEAGUE_SHORT.mlb, "MLB");
  assert.equal(leagueNameWithArticle("mlb"), "the MLB");
});

test("mlb is neither soccer nor cricket, has no ties, and has a table and a news feed", () => {
  assert.equal(isSoccerLeague("mlb"), false);
  assert.equal(isCricketLeague("mlb"), false);
  // Extra innings decide every baseball game; a tie is not a result.
  assert.equal(hasTies("mlb"), false);
  assert.equal(hasStandings("mlb"), true);
  assert.equal(hasNewsFeed("mlb"), true);
});

test("an MLB season is labelled by its single calendar year, and loaded from 2023", () => {
  assert.equal(formatSeasonLabel("mlb", 2026), "2026");
  assert.equal(formatSeasonLabel("mlb", null), null);
  assert.equal(HISTORY_START.mlb, 2023);
});

test("baseball has games on a schedule, and they start with a first pitch", () => {
  assert.deepEqual(scheduleWords("mlb"), { upcoming: "games", heading: "Schedule", start: "first pitch times" });
});

test("an MLB game's calendar day is the US Eastern one, like the NBA's", () => {
  assert.equal(dayTimeZone("mlb"), "America/New_York");
  assert.equal(dayZoneLabel("mlb"), "ET");
});

test("mlb has its own Elo parameters rather than falling back to the default", () => {
  assert.deepEqual(ELO_PARAMS.mlb, { k: 6, homeAdvantage: 25, seasonCarry: 0.7, marginScale: 2 });
});

test("a baseball article is drawn in the mlb palette", () => {
  assert.equal(paletteForTags(["mlb"]), "mlb");
  assert.equal(paletteForTags(["baseball"]), "mlb");
  assert.equal(paletteForTags(["world-series"]), "mlb");
  // An unrelated tag still wins when it comes first.
  assert.equal(paletteForTags(["tennis", "baseball"]), "tennis");
});

test("the USA and Canada edition offers an MLB table, right after the NBA's", () => {
  const blocks = startingBlocks({ key: "US", name: "USA", domesticLeague: null, nationalSide: null }, EMPTY_CONTEXT);
  const leagues = blocks.flatMap((b) => (b.type === "standings" ? [b.params.league] : []));
  assert.deepEqual(leagues.slice(0, 3), ["nfl", "nba", "mlb"]);
});

test("the block palette lists MLB under US sports", () => {
  const us = paletteGroups(EMPTY_CONTEXT).find((g) => g.name === "US sports");
  assert.ok(us);
  assert.deepEqual(
    us.blocks.flatMap((b) => (b.type === "standings" ? [b.params.league] : [])),
    ["nfl", "nba", "mlb"],
  );
});

test("MLB has a top-level nav link, beside the NFL's and the NBA's", () => {
  assert.ok(NAV_ITEMS.some((i) => i.href === "/mlb" && i.label === "MLB"));
});

test("the homepage's four always-active leagues are unchanged: baseball is reached from the menu", () => {
  // MLB is in season from March to October only, so it gets no permanent homepage section.
  assert.equal(LEAGUES.includes("mlb" as never), false);
});
