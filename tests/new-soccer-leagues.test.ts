// MLS, the Saudi Pro League, the Europa League and Ligue 1 on the soccer pipeline: the pure rules
// every page reads (labels, season labels, history, calendar day, zones, editions, block palette).
import { test } from "node:test";
import assert from "node:assert/strict";
import { ALL_LEAGUES, SOCCER_LEAGUES, LEAGUE_LABEL, LEAGUE_SHORT, HISTORY_START, formatSeasonLabel, leagueNameWithArticle, isCupCompetition, hasKnockoutRounds, isSoccerLeague, isLeague } from "../src/lib/leagues";
import { dayTimeZone } from "../src/lib/gameDay";
import { legendFor, zoneRules, relegationSummary, DOMESTIC_TABLE_SIZE } from "../src/lib/standingsZones";
import { editionFor, startingBlocks } from "../src/lib/editions";
import { paletteGroups } from "../src/lib/blockCatalogue";
import { ELO_PARAMS } from "../src/lib/analytics";

const NEW = ["mls", "saudi", "europa", "ligue1"] as const;

test("the four leagues are soccer leagues with their own labels", () => {
  for (const l of NEW) {
    assert.ok(isLeague(l), l);
    assert.ok(ALL_LEAGUES.includes(l), `${l} in ALL_LEAGUES`);
    assert.ok(SOCCER_LEAGUES.includes(l), `${l} in SOCCER_LEAGUES`);
    assert.ok(isSoccerLeague(l));
  }
  assert.equal(LEAGUE_LABEL.mls, "MLS");
  assert.equal(LEAGUE_LABEL.saudi, "Saudi Pro League");
  assert.equal(LEAGUE_LABEL.europa, "Europa League");
  assert.equal(LEAGUE_LABEL.ligue1, "Ligue 1");
  assert.equal(new Set(ALL_LEAGUES.map((l) => LEAGUE_SHORT[l])).size, ALL_LEAGUES.length);
});

test("the Europa League is a cup; MLS has knockout rounds but is not a cup", () => {
  assert.equal(isCupCompetition("europa"), true);
  assert.equal(isCupCompetition("mls"), false);
  assert.equal(hasKnockoutRounds("mls"), true);
  assert.equal(hasKnockoutRounds("ucl"), true);
  assert.equal(hasKnockoutRounds("europa"), true);
  assert.equal(hasKnockoutRounds("saudi"), false);
  assert.equal(hasKnockoutRounds("epl"), false);
});

test("MLS is a calendar-year season; the others straddle two years", () => {
  assert.equal(formatSeasonLabel("mls", 2026), "2026");
  assert.equal(formatSeasonLabel("saudi", 2026), "2026-27");
  assert.equal(formatSeasonLabel("ligue1", 2026), "2026-27");
  assert.equal(formatSeasonLabel("europa", 2026), "2026-27");
});

test("'MLS' takes no article, the Saudi Pro League does", () => {
  assert.equal(leagueNameWithArticle("mls", true), "MLS");
  assert.equal(leagueNameWithArticle("saudi"), "the Saudi Pro League");
  assert.equal(leagueNameWithArticle("ligue1", true), "The Ligue 1".replace("The Ligue 1", "Ligue 1"));
  assert.equal(leagueNameWithArticle("europa"), "the Europa League");
});

test("history starts in 2023 for MLS and the Saudi league (Ronaldo and Messi's arrival), 2015 for the European pair", () => {
  assert.equal(HISTORY_START.mls, 2023);
  assert.equal(HISTORY_START.saudi, 2023);
  assert.equal(HISTORY_START.europa, 2015);
  assert.equal(HISTORY_START.ligue1, 2015);
});

test("an MLS game's calendar day is the US Eastern one, like the NBA; the other three keep UTC", () => {
  assert.equal(dayTimeZone("mls"), "America/New_York");
  assert.equal(dayTimeZone("saudi"), "UTC");
  assert.equal(dayTimeZone("ligue1"), "UTC");
  assert.equal(dayTimeZone("europa"), "UTC");
});

test("Saudi Pro League zones: top three to the AFC Champions League Elite, bottom three down", () => {
  const at = (p: number) => zoneRules("saudi", 18)!(p)?.label ?? null;
  assert.deepEqual([1, 3, 4, 15, 16, 18].map(at), ["AFC Champions League Elite", "AFC Champions League Elite", null, null, "Relegation", "Relegation"]);
  assert.deepEqual(legendFor("saudi", 18).map((z) => z.label), ["AFC Champions League Elite", "Relegation"]);
  assert.equal(zoneRules("saudi", 20), null);
  assert.equal(DOMESTIC_TABLE_SIZE.saudi, 18);
});

test("Ligue 1 zones: three Champions League places and a qualifier, Europa, Conference, a play-off place and two down", () => {
  const at = (p: number) => zoneRules("ligue1", 18)!(p)?.label ?? null;
  assert.deepEqual([1, 3, 4, 5, 6, 7, 15, 16, 17, 18].map(at), [
    "Champions League", "Champions League", "Champions League qualifying", "Europa League", "Conference League", null, null, "Relegation play-off", "Relegation", "Relegation",
  ]);
  assert.equal(DOMESTIC_TABLE_SIZE.ligue1, 18);
});

test("MLS zones per conference: seven playoff places and two wild cards, no relegation", () => {
  const at = (p: number) => zoneRules("mls", 15)!(p)?.label ?? null;
  assert.deepEqual([1, 7, 8, 9, 10, 15].map(at), ["MLS Cup Playoffs", "MLS Cup Playoffs", "Wild Card", "Wild Card", null, null]);
  assert.deepEqual(legendFor("mls", 15).map((z) => z.label), ["MLS Cup Playoffs", "Wild Card"]);
  assert.equal(zoneRules("mls", 30), null);
});

test("Europa League zones follow the Champions League's shapes", () => {
  assert.deepEqual(legendFor("europa", 36).map((z) => z.label), ["Round of 16", "Knockout playoffs", "Eliminated"]);
  assert.deepEqual(legendFor("europa", 4).map((z) => z.label), ["Knockout round", "Conference League", "Eliminated"]);
});

test("relegation: none in MLS, two plus a play-off in Ligue 1, three in the Saudi league", () => {
  const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ team_espn_id: String(i + 1), zone: null })) as never[];
  const mls = relegationSummary("mls", rows(15));
  assert.deepEqual([mls.relegated.length, mls.playoff.length], [0, 0]);
  const l1 = relegationSummary("ligue1", rows(18));
  assert.deepEqual([l1.relegated.length, l1.playoff.length], [2, 1]);
  const ksa = relegationSummary("saudi", rows(18));
  assert.deepEqual([ksa.relegated.length, ksa.playoff.length], [3, 0]);
});

test("editions: the USA gets an MLS table after the NBA, Saudi Arabia leads with its league, France with Ligue 1", () => {
  const ctx = { cricketSides: [], featuredCricketSeries: null };
  const us = startingBlocks(editionFor("US"), ctx).map((b) => b.label);
  assert.deepEqual(us.slice(0, 4), ["Live in your blocks", "NFL standings", "NBA standings", "MLS standings"]);
  assert.equal(editionFor("SA").name, "Saudi Arabia");
  assert.equal(startingBlocks(editionFor("SA"), ctx)[1].label, "Saudi Pro League standings");
  assert.equal(editionFor("FR").domesticLeague, "ligue1");
  assert.equal(startingBlocks(editionFor("FR"), ctx)[1].label, "Ligue 1 standings");
});

test("the Football block palette offers all four", () => {
  const football = paletteGroups({ cricketSides: [], featuredCricketSeries: null }).find((g) => g.name === "Football")!;
  const labels = football.blocks.map((b) => b.label);
  for (const want of ["MLS standings", "Saudi Pro League standings", "Europa League standings", "Ligue 1 standings"]) assert.ok(labels.includes(want), want);
});

test("Elo parameters exist for each, the Europa League tuned like the Champions League", () => {
  for (const l of NEW) assert.ok(ELO_PARAMS[l], l);
  assert.deepEqual(ELO_PARAMS.europa, ELO_PARAMS.ucl);
});
