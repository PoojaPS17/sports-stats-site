import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cricketSeriesStandingsUrl, parseCricketSeriesStandings, pointsTableShown } from "../src/lib/cricketSeriesStandings";

// ESPN serves a points table for any series at site.web.api.espn.com/apis/v2/sports/cricket/<series id>/standings
// (probed 2026-10-05: CSA Women Pro50 1554058, Canada Super 60 Women 1506240, a women's U19 tri-series 1554704; the
// site.api.espn.com host answers 404). Points come from the feed, never from counting results: the CSA table gives
// Titans Women 5 points for one win (a bonus-point competition) and Western Province 2 for theirs.
const body = JSON.parse(readFileSync(new URL("./fixtures/espn-cricket-standings-1554058.json", import.meta.url), "utf8"));

test("parseCricketSeriesStandings: one group, the rows in rank order with the feed's points", () => {
  const table = parseCricketSeriesStandings(body);
  assert.ok(table);
  assert.equal(table.seasonYear, 2026);
  assert.equal(table.groups.length, 1);
  assert.equal(table.groups[0].name, null);
  const rows = table.groups[0].rows;
  assert.equal(rows.length, 8);
  assert.deepEqual(rows.slice(0, 2).map((r) => [r.rank, r.team, r.played, r.won, r.lost, r.tied, r.noResult, r.points, r.nrr]), [
    [1, "Titans Women", 1, 1, 0, 0, 0, 5, "1.72"],
    [2, "Western Province Women", 1, 1, 0, 0, 0, 2, "1.3"],
  ]);
  assert.equal(rows[0].teamId, "1334887");
  assert.equal(rows[0].abbreviation, "TTN-W");
  // Logos go through resolveTeamLogo: every CSA provincial side is on its known-missing list (ESPN serves a 404 for
  // each), and Eastern Province's feed row has none anyway, so no row carries one here.
  assert.deepEqual(rows.map((r) => r.logo), Array(8).fill(null));
  assert.equal(table.hasNrr, true);
  assert.equal(table.hasTies, false);
  assert.equal(table.hasQualified, false);
});

test("parseCricketSeriesStandings: a feed without net run rate or ties hides those columns", () => {
  const two = {
    season: { year: 2026 },
    children: [
      {
        name: "Group A",
        standings: {
          name: "overall",
          entries: [
            { team: { id: "1", displayName: "A", abbreviation: "A", logos: [{ href: "https://a.espncdn.com/i/teamlogos/cricket/500/1.png" }] }, stats: [{ name: "rank", value: 1 }, { name: "matchesPlayed", value: 2 }, { name: "matchesWon", value: 1 }, { name: "matchesLost", value: 0 }, { name: "matchesTied", value: 1 }, { name: "noresult", value: 0 }, { name: "matchPoints", value: 3 }, { name: "qualified", value: 1 }] },
            { team: { id: "2", displayName: "B", abbreviation: "B" }, stats: [{ name: "rank", value: 2 }, { name: "matchesPlayed", value: 2 }, { name: "matchesWon", value: 0 }, { name: "matchesLost", value: 1 }, { name: "matchesTied", value: 1 }, { name: "noresult", value: 0 }, { name: "matchPoints", value: 1 }] },
          ],
        },
      },
    ],
  };
  const table = parseCricketSeriesStandings(two);
  assert.ok(table);
  assert.equal(table.groups[0].name, "Group A");
  assert.equal(table.hasNrr, false);
  assert.equal(table.hasTies, true);
  assert.equal(table.hasQualified, true);
  assert.deepEqual(
    table.groups[0].rows.map((r) => [r.team, r.tied, r.points, r.nrr, r.qualified, r.logo]),
    [
      ["A", 1, 3, null, true, "https://a.espncdn.com/i/teamlogos/cricket/500/1.png"],
      // No qualified stat on B's row: not known, which is not "no".
      ["B", 1, 1, null, null, null],
    ]
  );
});

test("parseCricketSeriesStandings: an error body, no children or no entries is no table", () => {
  assert.equal(parseCricketSeriesStandings(null), null);
  assert.equal(parseCricketSeriesStandings({ code: 404, message: "Event ID null is invalid" }), null);
  assert.equal(parseCricketSeriesStandings({ children: [] }), null);
  assert.equal(parseCricketSeriesStandings({ children: [{ standings: { entries: [] } }] }), null);
});

// A two-team table is a bilateral series' win count, not a points table; a table from another season of the same
// tournament (the feed is keyed by ESPN's league id, which an edition key shares) must not be shown as this one's.
test("pointsTableShown: three or more teams, and the season must match when both sides know it", () => {
  const table = parseCricketSeriesStandings(body)!;
  assert.equal(pointsTableShown(table, { season: 2026 }), true);
  assert.equal(pointsTableShown(table, { season: null }), true);
  assert.equal(pointsTableShown(table, { season: 2025 }), false);
  assert.equal(pointsTableShown({ ...table, seasonYear: null }, { season: 2025 }), true);
  const bilateral = { ...table, groups: [{ name: null, rows: table.groups[0].rows.slice(0, 2) }] };
  assert.equal(pointsTableShown(bilateral, { season: 2026 }), false);
  assert.equal(pointsTableShown(null, { season: 2026 }), false);
});

test("cricketSeriesStandingsUrl: the feed is keyed by ESPN's league id, so an edition key is reduced to it", () => {
  assert.equal(cricketSeriesStandingsUrl("1554058"), "https://site.web.api.espn.com/apis/v2/sports/cricket/1554058/standings");
  assert.equal(cricketSeriesStandingsUrl("8679-2026"), "https://site.web.api.espn.com/apis/v2/sports/cricket/8679/standings");
});
