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
