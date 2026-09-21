// Cricket rates the way Statsguru writes them: an average, strike rate or economy is cut at two
// decimals, not rounded. Figures are real: Rohit Sharma ODI, 2609 runs in 44 dismissals is 59.2955, which
// Statsguru prints as 59.29 (a rounding formatter says 59.30); an economy of 3.6667 reads 3.66.
process.env.DATABASE_URL ??= "postgres://postgres:password@localhost:1/none";

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { trunc2 } from "../src/lib/cricketFormat";
import { cricketGroups } from "../src/lib/compare";
import { CricketCareer } from "../src/components/CricketCareer";
import { CRICKET_SPLIT_DIMENSIONS } from "../src/lib/queries";
import type { CricketCareerStats } from "../src/lib/queries";

/* ---- trunc2 ------------------------------------------------------------- */

test("trunc2 cuts at two decimals, it does not round", () => {
  assert.equal(trunc2(2609 / 44), "59.29"); // 59.2955
  assert.equal(trunc2(3.6667), "3.66");
  assert.equal(trunc2(100 / 3), "33.33");
  assert.equal(trunc2(200 / 3), "66.66"); // 66.666..., rounding would say 66.67
  assert.equal(trunc2(50), "50.00");
  assert.equal(trunc2(0), "0.00");
  // floating point: 0.29 is 0.28999999999999998 and 4.35 is 4.3499999999999996; both keep their digits
  assert.equal(trunc2(0.29), "0.29");
  assert.equal(trunc2(4.35), "4.35");
  assert.equal(trunc2(2.9999999999996), "3.00");
});

test("trunc2 prints a placeholder for a rate with nothing behind it, as the formatters it replaces did", () => {
  assert.equal(trunc2(null), "-");
  assert.equal(trunc2(undefined), "-");
  assert.equal(trunc2(Number.NaN), "-");
  assert.equal(trunc2(1 / 0), "-"); // zero denominator
  assert.equal(trunc2(0 / 0), "-");
  assert.equal(trunc2(null, 2, "—"), "—");
});

test("trunc2 handles a negative rate toward zero and any number of digits", () => {
  assert.equal(trunc2(-1.999), "-1.99");
  assert.equal(trunc2(-0.001), "0.00");
  assert.equal(trunc2(154.16666, 1), "154.1");
  assert.equal(trunc2(59.9), "59.90");
  assert.equal(trunc2(59.99, 0), "59");
});

const career = (over: Partial<CricketCareerStats> = {}): CricketCareerStats => ({
  matches: 100, inningsBatted: 90, runs: 2609, ballsFaced: 3000, notOuts: 31, hundreds: 3, fifties: 10, highestScore: 140,
  average: 2609 / 44, strikeRate: (2609 / 2921) * 100, inningsBowled: 60, overs: 400.2, runsConceded: 1466, wickets: 400, economy: 3.6667, fiveWicketHauls: 5, catches: 20,
  ...over,
});
const noSplits = Object.fromEntries(CRICKET_SPLIT_DIMENSIONS.map((d) => [d.key, []])) as never;

test("the career panel writes the average, strike rate and economy the way Statsguru does", () => {
  const html = renderToStaticMarkup(createElement(CricketCareer, { league: "odi", career: career(), splits: noSplits }));
  assert.match(html, />59\.29<\/p>/); // batting average, 2609/44
  assert.doesNotMatch(html, />59\.30</);
  assert.match(html, />89\.31<\/p>/); // strike rate 89.3186... to two places
  // economy 3.6667 and bowling average 1466/400 = 3.665: both 3.66, never 3.67
  assert.equal((html.match(/>3\.66<\/p>/g) ?? []).length, 2);
  assert.doesNotMatch(html, />3\.67</);
});

test("the compare page's cricket metrics truncate too, and a missing rate is a dash", () => {
  const groups = cricketGroups(career(), career({ average: null, strikeRate: 150.999, economy: 8.0049 }));
  const metric = (label: string) => groups.flatMap((g) => g.metrics).find((m) => m.label === label)!;
  assert.deepEqual([metric("Average").aText, metric("Average").bText], ["59.29", "—"]);
  assert.deepEqual([metric("Strike rate").aText, metric("Strike rate").bText], ["89.31", "150.99"]);
  assert.deepEqual([metric("Economy").aText, metric("Economy").bText], ["3.66", "8.00"]);
  // counts and overs are not rates: unchanged
  assert.equal(metric("Runs").aText, "2609");
  assert.equal(metric("Overs").aText, "400.2");
});
