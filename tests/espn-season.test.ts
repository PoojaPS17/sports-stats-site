import { test } from "node:test";
import assert from "node:assert/strict";
import { espnSeasonTotals } from "../src/lib/espnSeason";

// Knicks 2022 row of the sample payload, as stored in player_season_stats.categories.
function knicks2022() {
  return {
    averages: {
      labels: ["GP", "GS", "MIN", "FG", "FG%", "3PT", "3P%", "FT", "FT%", "OR", "DR", "REB", "AST", "BLK", "STL", "PF", "TO", "PTS"],
      values: ["26", "4", "24.5", "4.7-10.5", "44.5", "1.4-3.5", "40.2", "1.2-1.2", "96.8", "0.8", "2.2", "3.0", "4.0", "0.5", "0.8", "0.6", "1.5", "12.0"],
    },
    totals: {
      labels: ["FG", "FG%", "3PT", "3P%", "FT", "FT%", "OR", "DR", "REB", "AST", "BLK", "STL", "PF", "TO", "PTS"],
      values: ["122-274", "44.5", "37-92", "40.2", "30-31", "96.8", "21", "57", "78", "103", "12", "22", "15", "39", "311"],
    },
  };
}

test("espnSeasonTotals reads the Knicks 2022 row", () => {
  const t = espnSeasonTotals(knicks2022());
  assert.deepEqual(t, {
    games: 26,
    starts: 4,
    minutesPerGame: 24.5,
    pts: 311,
    reb: 78,
    ast: 103,
    stl: 22,
    blk: 12,
    to: 39,
    fgm: 122,
    fga: 274,
    tpm: 37,
    tpa: 92,
    ftm: 30,
    fta: 31,
  });
});

test("espnSeasonTotals strips thousands separators", () => {
  const c = knicks2022();
  // 2 * 480 + 37 + 83 = 1,080 keeps the row consistent.
  c.totals.values[c.totals.labels.indexOf("PTS")] = "1,080";
  c.totals.values[c.totals.labels.indexOf("FG")] = "480-1,000";
  c.totals.values[c.totals.labels.indexOf("FT")] = "83-90";
  c.averages.values[c.averages.labels.indexOf("PTS")] = "41.5"; // 1,080 / 26 = 41.54: the averages agree with the totals
  const t = espnSeasonTotals(c);
  assert.equal(t?.pts, 1080);
  assert.equal(t?.fgm, 480);
  assert.equal(t?.fga, 1000);
});

test("espnSeasonTotals is null without totals", () => {
  const c = knicks2022() as Record<string, unknown>;
  delete c.totals;
  assert.equal(espnSeasonTotals(c), null);
});

test("espnSeasonTotals is null without averages", () => {
  const c = knicks2022() as Record<string, unknown>;
  delete c.averages;
  assert.equal(espnSeasonTotals(c), null);
});

test("espnSeasonTotals is null when GP is zero", () => {
  const c = knicks2022();
  c.averages.values[0] = "0";
  assert.equal(espnSeasonTotals(c), null);
});

test("espnSeasonTotals is null when a required total is missing", () => {
  const c = knicks2022();
  const i = c.totals.labels.indexOf("FT");
  c.totals.labels.splice(i, 1);
  c.totals.values.splice(i, 1);
  assert.equal(espnSeasonTotals(c), null);
});

test("espnSeasonTotals is null for junk input", () => {
  assert.equal(espnSeasonTotals(null), null);
  assert.equal(espnSeasonTotals(undefined), null);
  assert.equal(espnSeasonTotals("x"), null);
});

test("espnSeasonTotals gives starts null when GS is blank", () => {
  const c = knicks2022();
  c.averages.values[1] = "";
  const t = espnSeasonTotals(c);
  assert.equal(t?.starts, null);
  assert.equal(t?.games, 26);
});

// An internally inconsistent row is not a line: points are 2 x FGM + 3PM + FTM, and no made count exceeds its attempts.
test("espnSeasonTotals is null when points are not 2 x FGM + 3PM + FTM", () => {
  for (const pts of ["310", "312"]) {
    const c = knicks2022();
    c.totals.values[c.totals.labels.indexOf("PTS")] = pts;
    assert.equal(espnSeasonTotals(c), null, `PTS ${pts}`);
  }
});

test("espnSeasonTotals is null when a made count exceeds its attempts", () => {
  const withPair = (label: string, pair: string, pts: string) => {
    const c = knicks2022();
    c.totals.values[c.totals.labels.indexOf(label)] = pair;
    c.totals.values[c.totals.labels.indexOf("PTS")] = pts; // keep the points consistent so only the made > attempted rule fails
    return c;
  };
  assert.equal(espnSeasonTotals(withPair("FG", "275-274", "617")), null);
  assert.equal(espnSeasonTotals(withPair("3PT", "93-92", "367")), null);
  assert.equal(espnSeasonTotals(withPair("FT", "31-30", "312")), null);
  // Made equal to attempted is fine.
  assert.equal(espnSeasonTotals(withPair("FT", "31-31", "312"))?.ftm, 31);
});

// averages.PTS is ESPN's own per-game figure, rounded to one decimal; a row whose totals do not divide to it is not one season.
test("espnSeasonTotals is null when the averages' PTS disagrees with the totals' PTS over GP (a stint's GP against a season's totals)", () => {
  // GP 30 and 14.3 a game are one stint (about 429 points); the totals hold the whole season (1,000, itself consistent).
  const stint = {
    averages: { labels: ["GP", "GS", "MIN", "PTS"], values: ["30", "10", "28.0", "14.3"] },
    totals: {
      labels: ["FG", "3PT", "FT", "REB", "AST", "BLK", "STL", "TO", "PTS"],
      values: ["400-900", "100-300", "100-120", "300", "200", "20", "40", "100", "1000"],
    },
  };
  assert.equal(espnSeasonTotals(stint), null);
});

test("espnSeasonTotals still reads a row whose averages' PTS is the totals' PTS over GP correctly rounded", () => {
  // 311 / 26 = 11.96 shows as 12.0 (the Knicks row above); 89 / 37 = 2.405 shows as 2.4; the rounding error is at most 0.05.
  assert.equal(espnSeasonTotals(knicks2022())?.pts, 311);
  const c = knicks2022();
  const setAverage = (v: string) => { c.averages.values[c.averages.labels.indexOf("PTS")] = v; };
  setAverage("12.0"); // 0.04 off, as published
  assert.equal(espnSeasonTotals(c)?.pts, 311);
  setAverage("11.9"); // 0.06 off, not what one-decimal rounding produces
  assert.equal(espnSeasonTotals(c), null);
  setAverage("12.1");
  assert.equal(espnSeasonTotals(c), null);
  // A row with no averages PTS has nothing to compare and is read as before.
  const noAverage = knicks2022();
  const i = noAverage.averages.labels.indexOf("PTS");
  noAverage.averages.labels.splice(i, 1);
  noAverage.averages.values.splice(i, 1);
  assert.equal(espnSeasonTotals(noAverage)?.pts, 311);
});
