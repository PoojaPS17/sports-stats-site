// Which of ESPN's per-season rows the season-stats loader stores. Pure: no database, no network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { isTotalsRow, seasonRow } from "../scripts/lib/season-row";

// Luka Doncic's 2025 in ESPN's athlete /stats: one row per team plus a whole-season "Totals" row.
const luka = {
  name: "averages",
  labels: ["GP", "PTS"],
  statistics: [
    { season: { year: 2024 }, teamSlug: "dallas-mavericks", displayName: "2023-24", stats: ["70", "33.9"] },
    { season: { year: 2025 }, teamSlug: "dallas-mavericks", displayName: "2024-25", stats: ["22", "28.1"] },
    { season: { year: 2025 }, teamSlug: "los-angeles-lakers", displayName: "2024-25", stats: ["28", "28.2"] },
    { season: { year: 2025 }, teamSlug: "2024-25 Totals", displayName: "2024-25  Totals", stats: ["50", "28.2"] },
  ],
};

test("a traded player's season is ESPN's Totals row, not the first team's stint", () => {
  assert.deepEqual(seasonRow(luka, 2025), { labels: ["GP", "PTS"], values: ["50", "28.2"] });
});

test("the Totals row is found whichever position it has among the season's rows", () => {
  const totalsFirst = { ...luka, statistics: [luka.statistics[3], luka.statistics[1], luka.statistics[2]] };
  assert.deepEqual(seasonRow(totalsFirst, 2025)?.values, ["50", "28.2"]);
  const named = { labels: ["GP"], statistics: [{ season: { year: 2025 }, teamSlug: "a", stats: ["10"] }, { season: { year: 2025 }, displayName: "Totals", stats: ["30"] }] };
  assert.deepEqual(seasonRow(named, 2025)?.values, ["30"]);
});

test("a player with one row for the season gets that row", () => {
  assert.deepEqual(seasonRow(luka, 2024), { labels: ["GP", "PTS"], values: ["70", "33.9"] });
});

test("a season with no rows is null", () => {
  assert.equal(seasonRow(luka, 2030), null);
  assert.equal(seasonRow({ labels: ["GP"] }, 2025), null);
  assert.equal(seasonRow({ labels: ["GP"], statistics: [] }, 2025), null);
});

test("another season's Totals row is not the row for this season", () => {
  const category = {
    labels: ["GP", "PTS"],
    statistics: [
      { season: { year: 2025 }, teamSlug: "dallas-mavericks", stats: ["22", "28.1"] },
      { season: { year: 2024 }, teamSlug: "2023-24 Totals", displayName: "2023-24  Totals", stats: ["70", "33.9"] },
    ],
  };
  assert.deepEqual(seasonRow(category, 2025)?.values, ["22", "28.1"]);
  // A season whose only row is another season's Totals row has nothing.
  assert.equal(seasonRow({ labels: category.labels, statistics: [category.statistics[1]] }, 2025), null);
});

test("with a league given, the first row of that league is taken, as before", () => {
  const category = {
    labels: ["GP", "PTS"],
    statistics: [
      { season: { year: 2025 }, leagueSlug: "esp.1", teamSlug: "a", stats: ["22", "28.1"] },
      { season: { year: 2025 }, leagueSlug: "eng.1", teamSlug: "b", stats: ["28", "28.2"] },
      { season: { year: 2025 }, leagueSlug: "eng.1", teamSlug: "2024-25 Totals", displayName: "Totals", stats: ["50", "28.2"] },
    ],
  };
  assert.deepEqual(seasonRow(category, 2025, "eng.1")?.values, ["28", "28.2"]);
  assert.equal(seasonRow(category, 2025, "ger.1"), null);
});

test("a soccer-shaped category is read by season and league, first match, exactly as before", () => {
  const soccer = {
    name: "offensive",
    labels: ["GP", "G", "A"],
    statistics: [
      { season: { year: 2025 }, leagueSlug: "fra.1", teamSlug: "psg", stats: ["30", "9", "4"] },
      { season: { year: 2025 }, leagueSlug: "eng.1", teamSlug: "arsenal", stats: ["20", "5", "3"] },
      { season: { year: 2025 }, leagueSlug: "eng.1", teamSlug: "chelsea", stats: ["10", "2", "1"] },
      { season: { year: 2024 }, leagueSlug: "eng.1", teamSlug: "arsenal", stats: ["35", "11", "6"] },
    ],
  };
  assert.deepEqual(seasonRow(soccer, 2025, "eng.1"), { labels: ["GP", "G", "A"], values: ["20", "5", "3"] });
  assert.deepEqual(seasonRow(soccer, 2024, "eng.1")?.values, ["35", "11", "6"]);
  assert.equal(seasonRow(soccer, 2024, "fra.1"), null);
});

test("a category without labels or stats still gives arrays", () => {
  assert.deepEqual(seasonRow({ statistics: [{ season: { year: 2025 } }] }, 2025), { labels: [], values: [] });
});

test("isTotalsRow reads the team slug and the display name", () => {
  assert.equal(isTotalsRow({ teamSlug: "2024-25 Totals" }), true);
  assert.equal(isTotalsRow({ displayName: "2024-25  Totals" }), true);
  assert.equal(isTotalsRow({ displayName: "Total" }), true);
  assert.equal(isTotalsRow({ teamSlug: "los-angeles-lakers", displayName: "2024-25" }), false);
  assert.equal(isTotalsRow({ teamSlug: "subtotals-fc" }), false);
  assert.equal(isTotalsRow({}), false);
});
