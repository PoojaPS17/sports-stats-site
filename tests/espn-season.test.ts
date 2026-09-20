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
  c.totals.values[c.totals.labels.indexOf("PTS")] = "1,080";
  c.totals.values[c.totals.labels.indexOf("FG")] = "1,122-2,274";
  const t = espnSeasonTotals(c);
  assert.equal(t?.pts, 1080);
  assert.equal(t?.fgm, 1122);
  assert.equal(t?.fga, 2274);
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
