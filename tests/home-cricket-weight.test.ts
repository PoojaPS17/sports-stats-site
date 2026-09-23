// Regression test for the homepage cricket widgets barely showing any Asian Games
// matches: cricketWeight() used to rank a match purely on whether its teams were ICC
// full members, so an Asian Games fixture between two associate nations (e.g. Hong
// Kong v Malaysia) scored the same low weight as an ordinary associate friendly and
// lost out to full-member bilateral tours for the homepage's limited slots.
process.env.TZ = "UTC";
process.env.DATABASE_URL ??= "postgres://postgres:password@localhost:1/none";

import { test } from "node:test";
import assert from "node:assert/strict";
import { cricketWeight } from "../src/lib/homeData";
import type { CricketSeriesMatch } from "../src/lib/cricketSeries";

const side = (name: string) => ({ id: "1", name, abbreviation: null, score: null, winner: false, logo: null });

const match = (over: Partial<CricketSeriesMatch> = {}): CricketSeriesMatch =>
  ({
    espn_id: "1", series_espn_id: "99999", series_name: "Some Bilateral Tour 2026", series_kind: "international",
    date: "2026-09-24T00:00:00Z", name: "x", short_name: null, description: null, class_card: "T20I",
    international_class_id: "3", status_state: "pre", status_summary: null,
    home: side("Hong Kong"), away: side("Malaysia"), scorecard_league: null,
    ...over,
  }) as CricketSeriesMatch;

test("an associate-vs-associate Asian Games match ranks with full internationals, not with an ordinary associate fixture", () => {
  const asianGames = match({ series_name: "Asian Games Men's Cricket Competition 2026" });
  const ordinaryAssociateMatch = match({ series_name: "Some Bilateral Tour 2026" });
  assert.equal(cricketWeight(asianGames), 0, "an Asian Games fixture should rank top-tier regardless of which nations are playing");
  assert.equal(cricketWeight(ordinaryAssociateMatch), 2, "an ordinary associate-only fixture should still rank at the bottom");
});

test("Commonwealth Games and Olympic cricket get the same boost, matched by name not a stored edition id", () => {
  assert.equal(cricketWeight(match({ series_name: "Commonwealth Games Women's T20 Cricket 2026" })), 0);
  assert.equal(cricketWeight(match({ series_name: "Olympic Games Cricket Competition 2028" })), 0);
});

test("a full-member Asian Games match still ranks top-tier (no double-counting, no regression)", () => {
  const m = match({ series_name: "Asian Games Men's Cricket Competition 2026", home: side("India"), away: side("Afghanistan") });
  assert.equal(cricketWeight(m), 0);
});

test("existing behaviour is unchanged: full-member and featured-series ranking still works", () => {
  const twoFullMembers = match({ home: side("India"), away: side("Australia") });
  const oneFullMember = match({ home: side("India"), away: side("Hong Kong") });
  const neitherFullMember = match({ home: side("Hong Kong"), away: side("Malaysia") });
  const storedScorecard = match({ scorecard_league: "ipl" });
  assert.equal(cricketWeight(twoFullMembers), 0);
  assert.equal(cricketWeight(oneFullMember), 1);
  assert.equal(cricketWeight(neitherFullMember), 2);
  assert.equal(cricketWeight(storedScorecard), 0);
});
