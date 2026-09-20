// The pure parts of the player-totals audit: no database, no network.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  compareSeason,
  espnFigures,
  gamesPlayedFromPayload,
  MAX_LISTED_DRIFT,
  parseArgs,
  seasonsFromPayload,
  siteSeasonOrEmpty,
  siteSeasons,
  tradedSeasons,
  USAGE,
  type SeasonFigures,
} from "../scripts/lib/audit-player-totals";
import { seasonRow } from "../scripts/lib/season-row";
import { buildStagedProfile, type PlayerLogRow, type Stats } from "../src/lib/playerProfile";
import type { GameStage } from "../src/lib/gameStage";

const nbaSite = (games: number, ppg: number | null): SeasonFigures => ({ games, figures: { ppg } });
const nbaEspn = (games: number | null, ppg: number | null): SeasonFigures => ({ games, figures: { ppg } });

test("equal games and equal points per game match", () => {
  const r = compareSeason(nbaSite(70, 27.0), nbaEspn(70, 27.0));
  assert.equal(r.verdict, "match");
  assert.deepEqual(r.differences, []);
});

test("78 site games against 70 ESPN games is a MISMATCH carrying both values", () => {
  const r = compareSeason(nbaSite(78, 27.0), nbaEspn(70, 27.0));
  assert.equal(r.verdict, "MISMATCH");
  assert.deepEqual(r.differences, [{ field: "games", site: 78, espn: 70 }]);
});

test("a site with no games for a season ESPN has is a coverage gap, never a match", () => {
  const r = compareSeason(nbaSite(0, null), nbaEspn(70, 27.0));
  assert.equal(r.verdict, "no box scores");
  assert.deepEqual(r.differences, []);
});

test("points per game compare at one decimal", () => {
  assert.equal(compareSeason(nbaSite(70, 27.04), nbaEspn(70, 27.0)).verdict, "match");
  const r = compareSeason(nbaSite(70, 27.04), nbaEspn(70, 26.9));
  assert.equal(r.verdict, "MISMATCH");
  assert.deepEqual(r.differences, [{ field: "ppg", site: 27.04, espn: 26.9 }]);
});

test("a games mismatch and a figure mismatch are both reported", () => {
  const r = compareSeason(nbaSite(78, 25.0), nbaEspn(70, 27.0));
  assert.equal(r.verdict, "MISMATCH");
  assert.deepEqual(
    r.differences.map((d) => d.field),
    ["games", "ppg"]
  );
});

const nflSite = (games: number, figures: Record<string, number | null>, gamesSource?: "espn" | "logged"): SeasonFigures =>
  gamesSource ? { games, gamesSource, figures } : { games, figures };

test("NFL: equal yards and touchdowns match, a differing yard total is a MISMATCH", () => {
  const espn: SeasonFigures = { games: 17, figures: { passYds: 4183, passTd: 27, rushYds: 422, rushTd: 5, recYds: null, recTd: null } };
  assert.equal(compareSeason(nflSite(17, { passYds: 4183, passTd: 27, rushYds: 422, rushTd: 5, recYds: 0, recTd: 0 }), espn, { league: "nfl" }).verdict, "match");
  const r = compareSeason(nflSite(17, { passYds: 4183, passTd: 27, rushYds: 415, rushTd: 5, recYds: 0, recTd: 0 }), espn, { league: "nfl" });
  assert.equal(r.verdict, "MISMATCH");
  assert.deepEqual(r.differences, [{ field: "rushYds", site: 415, espn: 422 }]);
});

test("missing ESPN games played is never a match: it is its own visible class", () => {
  const espn: SeasonFigures = { games: null, figures: { passYds: 100 } };
  const r = compareSeason(nflSite(9, { passYds: 100 }), espn, { league: "nfl" });
  assert.equal(r.verdict, "games not verified");
  assert.deepEqual(r.differences, []);
  // NBA too: a row with points per game and no GP.
  assert.equal(compareSeason(nbaSite(70, 27.0), nbaEspn(null, 27.0)).verdict, "games not verified");
  // A figure that differs is still a MISMATCH; the unverified games do not hide it.
  assert.equal(compareSeason(nbaSite(70, 25.0), nbaEspn(null, 27.0)).verdict, "MISMATCH");
});

test("a real 0 and a figure ESPN does not list are the same number, on either side", () => {
  const espn: SeasonFigures = { games: 17, figures: { passYds: 4000, recYds: null } };
  assert.equal(compareSeason(nflSite(17, { passYds: 4000, recYds: 0 }), espn, { league: "nfl" }).verdict, "match");
  const espnZero: SeasonFigures = { games: 17, figures: { passYds: 4000, recYds: 0 } };
  assert.equal(compareSeason(nflSite(17, { passYds: 4000, recYds: null }), espnZero, { league: "nfl" }).verdict, "match");
  assert.equal(compareSeason(nflSite(17, { passYds: 4000, recYds: 12 }), espn, { league: "nfl" }).verdict, "MISMATCH");
});

test("NFL: site games above ESPN's are a MISMATCH", () => {
  const espn: SeasonFigures = { games: 15, figures: { rushYds: 900, rushTd: 6 } };
  const r = compareSeason(nflSite(17, { rushYds: 900, rushTd: 6 }), espn, { league: "nfl" });
  assert.equal(r.verdict, "MISMATCH");
  assert.deepEqual(r.differences, [{ field: "games", site: 17, espn: 15 }]);
});

test("NFL: fewer site games than ESPN with every figure equal is 'games short (no stat line)' when the page shows the logged count, with the gap", () => {
  const espn: SeasonFigures = { games: 17, figures: { rushYds: 900, rushTd: 6 } };
  const r = compareSeason(nflSite(15, { rushYds: 900, rushTd: 6 }, "logged"), espn, { league: "nfl" });
  assert.equal(r.verdict, "games short (no stat line)");
  assert.deepEqual(r.differences, [{ field: "games", site: 15, espn: 17 }]);
});

// -- NFL games: the page shows ESPN's stored figure, or the logged count when none is stored ---------

const rushing = { rushYds: 900, rushTd: 6 };
const espn16: SeasonFigures = { games: 16, figures: rushing };

test("NFL: the page's ESPN figure equal to ESPN's is a match", () => {
  assert.equal(compareSeason(nflSite(16, rushing, "espn"), espn16, { league: "nfl" }).verdict, "match");
});

test("NFL: site 1 game (logged, no ESPN figure stored) against ESPN 16 is 'games short (no stat line)'", () => {
  const r = compareSeason(nflSite(1, rushing, "logged"), espn16, { league: "nfl" });
  assert.equal(r.verdict, "games short (no stat line)");
  assert.deepEqual(r.differences, [{ field: "games", site: 1, espn: 16 }]);
});

test("NFL: site 15 with ESPN's stored figure (stale or wrong) against ESPN 16 is a MISMATCH", () => {
  const r = compareSeason(nflSite(15, rushing, "espn"), espn16, { league: "nfl" });
  assert.equal(r.verdict, "MISMATCH");
  assert.deepEqual(r.differences, [{ field: "games", site: 15, espn: 16 }]);
});

test("NFL: fewer site games with no known source is a MISMATCH, not games short", () => {
  assert.equal(compareSeason(nflSite(15, rushing), espn16, { league: "nfl" }).verdict, "MISMATCH");
});

test("NFL: site 17 against ESPN 16 is a MISMATCH whatever the source", () => {
  for (const source of ["espn", "logged"] as const) {
    const r = compareSeason(nflSite(17, rushing, source), espn16, { league: "nfl" });
    assert.equal(r.verdict, "MISMATCH");
    assert.deepEqual(r.differences, [{ field: "games", site: 17, espn: 16 }]);
  }
});

test("NFL: a figure difference wins over games short, for a logged season too", () => {
  const r = compareSeason(nflSite(1, { rushYds: 850, rushTd: 6 }, "logged"), espn16, { league: "nfl" });
  assert.equal(r.verdict, "MISMATCH");
  assert.deepEqual(r.differences.map((d) => d.field), ["games", "rushYds"]);
});

test("NBA: a games difference is a MISMATCH whatever gamesSource says", () => {
  assert.equal(compareSeason({ games: 68, gamesSource: "logged", figures: { ppg: 27.0 } }, nbaEspn(70, 27.0), { league: "nba" }).verdict, "MISMATCH");
  assert.equal(compareSeason({ games: 68, gamesSource: "espn", figures: { ppg: 27.0 } }, nbaEspn(70, 27.0), { league: "nba" }).verdict, "MISMATCH");
});

test("NFL: fewer site games and a differing yard total is a MISMATCH carrying both differences", () => {
  const espn: SeasonFigures = { games: 17, figures: { rushYds: 900, rushTd: 6 } };
  const r = compareSeason(nflSite(15, { rushYds: 850, rushTd: 6 }), espn, { league: "nfl" });
  assert.equal(r.verdict, "MISMATCH");
  assert.deepEqual(r.differences.map((d) => d.field), ["games", "rushYds"]);
});

test("NBA: any games difference is a MISMATCH; there is no games-short class for the NBA", () => {
  assert.equal(compareSeason(nbaSite(68, 27.0), nbaEspn(70, 27.0), { league: "nba" }).verdict, "MISMATCH");
  assert.equal(compareSeason(nbaSite(68, 27.0), nbaEspn(70, 27.0)).verdict, "MISMATCH");
  assert.equal(compareSeason(nbaSite(72, 27.0), nbaEspn(70, 27.0), { league: "nba" }).verdict, "MISMATCH");
});

test("points per game use the display's one-decimal rounding, half rounding up", () => {
  // 27.05 shows as 27.1 on the page, so it equals ESPN's 27.1 and not its 27.0.
  assert.equal(compareSeason(nbaSite(70, 27.05), nbaEspn(70, 27.1)).verdict, "match");
  assert.equal(compareSeason(nbaSite(70, 27.05), nbaEspn(70, 27.0)).verdict, "MISMATCH");
  // 27.15 is 27.149999... in binary but shows as 27.2.
  assert.equal(compareSeason(nbaSite(70, 27.15), nbaEspn(70, 27.2)).verdict, "match");
  assert.equal(compareSeason(nbaSite(70, 27.04), nbaEspn(70, 27.1)).verdict, "MISMATCH");
});

test("a season ESPN has no row for: a listed class, unless ESPN is authoritative for it", () => {
  assert.equal(compareSeason(nbaSite(70, 27.0), null).verdict, "no ESPN row");
  const required = compareSeason(nbaSite(70, 27.0), null, { requireEspnRow: true });
  assert.equal(required.verdict, "MISMATCH");
  assert.deepEqual(required.differences, [{ field: "ESPN row", site: 70, espn: null }]);
  // A row with none of the audited figures is the same as no row.
  assert.equal(compareSeason(nbaSite(70, 27.0), nbaEspn(null, null), { requireEspnRow: true }).verdict, "MISMATCH");
});

test("an ESPN row with no audited data and no site games is nothing to compare, not a missing row", () => {
  assert.equal(compareSeason(nbaSite(0, null), nbaEspn(null, null)).verdict, "nothing to compare");
  assert.equal(compareSeason(nbaSite(0, null), null).verdict, "nothing to compare");
  assert.equal(compareSeason(nbaSite(0, null), null, { requireEspnRow: true }).verdict, "nothing to compare");
});

// -- NBA: games ESPN published no box score for -------------------------------------------------------
// ESPN's GP and PPG cover every game the team played; the site's average covers the games with a stat line.

type NoBoxScore = NonNullable<SeasonFigures["noBoxScore"]>;
const nba = { league: "nba" } as const;
const noBox = (listed: number, recorded: number, points: number, bestGame: number): NoBoxScore => ({ listed, recorded, points, bestGame });
const siteNoBox = (games: number, ppg: number | null, nb: NoBoxScore): SeasonFigures => ({ games, figures: { ppg }, noBoxScore: nb });
// The worked case: 76 games on ESPN (total 25.3 x 76 = 1922.8), 70 with a stat line adding up to 1747 (24.957 a game), best game 41.
const seventy = noBox(76, 70, 1747, 41);

test("NBA no box score: games equal, ppg below ESPN's but inside what the missing games could hold, is explained and carries the ppg difference", () => {
  const r = compareSeason(siteNoBox(76, 24.96, seventy), nbaEspn(76, 25.3), nba);
  assert.equal(r.verdict, "explained (no box score)");
  assert.deepEqual(r.differences, [{ field: "ppg", site: 24.96, espn: 25.3 }]);
});

test("NBA no box score: ppg equal at one decimal is a match, with nothing listed", () => {
  for (const ppg of [25.3, 25.28, 25.34]) {
    const r = compareSeason(siteNoBox(76, ppg, seventy), nbaEspn(76, 25.3), nba);
    assert.equal(r.verdict, "match");
    assert.deepEqual(r.differences, []);
  }
});

test("NBA no box score: ppg above the bound (bestGame x missing games + tol) is a MISMATCH with a ppg difference", () => {
  // missing 6, tol 0.05 x 76 = 3.8: the bound is 41 x 6 + 3.8 = 249.8 above the recorded 1747, so ESPN's total may reach 1996.8.
  assert.equal(compareSeason(siteNoBox(76, 24.96, seventy), nbaEspn(76, 26.2), nba).verdict, "explained (no box score)"); // 1991.2
  const r = compareSeason(siteNoBox(76, 24.96, seventy), nbaEspn(76, 26.3), nba); // 1998.8
  assert.equal(r.verdict, "MISMATCH");
  assert.deepEqual(r.differences, [{ field: "ppg", site: 24.96, espn: 26.3 }]);
});

test("NBA no box score: ppg below the lower bound (the site's total above ESPN's by more than tol) is a MISMATCH", () => {
  // ESPN's total must be at least 1747 - 3.8 = 1743.2: 22.9 x 76 = 1740.4 is below it, 23.0 x 76 = 1748 is above.
  const r = compareSeason(siteNoBox(76, 24.96, seventy), nbaEspn(76, 22.9), nba);
  assert.equal(r.verdict, "MISMATCH");
  assert.deepEqual(r.differences, [{ field: "ppg", site: 24.96, espn: 22.9 }]);
  assert.equal(compareSeason(siteNoBox(76, 24.96, seventy), nbaEspn(76, 23.0), nba).verdict, "explained (no box score)");
});

test("NBA no box score: a site total above ESPN's by less than tol (ESPN's ppg is rounded) is explained, by more is a MISMATCH", () => {
  // 40 games, ESPN 20.0 (total 800), tol 2, 39 with a stat line.
  const at = (points: number) => compareSeason(siteNoBox(40, points / 39, noBox(40, 39, points, 40)), nbaEspn(40, 20.0), nba);
  assert.equal(at(801).verdict, "explained (no box score)"); // 800 - 801 = -1 >= -2
  assert.equal(at(803).verdict, "MISMATCH"); // -3 < -2
});

test("NBA no box score: the upper bound is the best recorded game times the missing games, plus tol", () => {
  // 40 games, 39 recorded for 20 points with a best game of 1, tol 2: ESPN's total may be at most 20 + 1 x 1 + 2 = 23.
  const site = siteNoBox(40, 0.51, noBox(40, 39, 20, 1));
  assert.equal(compareSeason(site, nbaEspn(40, 0.5), nba).verdict, "match"); // 20
  assert.equal(compareSeason(site, nbaEspn(40, 0.6), nba).verdict, "MISMATCH"); // 24
});

test("NBA no box score: nothing missing (recorded at or above ESPN's games) and a ppg difference is a MISMATCH", () => {
  const all = noBox(76, 76, 1747, 41);
  const r = compareSeason(siteNoBox(76, 24.96, all), nbaEspn(76, 25.3), nba);
  assert.equal(r.verdict, "MISMATCH");
  assert.deepEqual(r.differences, [{ field: "ppg", site: 24.96, espn: 25.3 }]);
  assert.equal(compareSeason(siteNoBox(76, 24.96, noBox(78, 77, 1747, 41)), nbaEspn(76, 25.3), nba).verdict, "MISMATCH");
});

test("NBA no box score: ESPN's ppg absent is a zero, and a zero total is below the lower bound", () => {
  const r = compareSeason(siteNoBox(76, 24.96, seventy), nbaEspn(76, null), nba);
  assert.equal(r.verdict, "MISMATCH");
  assert.deepEqual(r.differences, [{ field: "ppg", site: 24.96, espn: null }]);
});

test("NBA no box score: our listed count may differ from ESPN's games by MAX_LISTED_DRIFT, not by more", () => {
  assert.equal(MAX_LISTED_DRIFT, 2);
  for (const listed of [74, 75, 76, 77, 78]) {
    assert.equal(compareSeason(siteNoBox(76, 25.3, noBox(listed, 70, 1747, 41)), nbaEspn(76, 25.3), nba).verdict, "match", `listed ${listed}`);
  }
  for (const listed of [73, 79]) {
    const r = compareSeason(siteNoBox(76, 25.3, noBox(listed, 70, 1747, 41)), nbaEspn(76, 25.3), nba);
    assert.equal(r.verdict, "MISMATCH", `listed ${listed}`);
    assert.deepEqual(r.differences, [{ field: "games (listed)", site: listed, espn: 76 }]);
  }
});

test("NBA no box score: an explained ppg difference is never listed among a real mismatch's differences", () => {
  // Listed drift too large, ppg explained: only the games (listed) difference.
  const drift = compareSeason(siteNoBox(76, 24.96, noBox(80, 70, 1747, 41)), nbaEspn(76, 25.3), nba);
  assert.equal(drift.verdict, "MISMATCH");
  assert.deepEqual(drift.differences, [{ field: "games (listed)", site: 80, espn: 76 }]);
  // Shown games differ from ESPN's (a stale stored figure), ppg explained: only the games difference.
  const stale = compareSeason(siteNoBox(74, 24.96, seventy), nbaEspn(76, 25.3), nba);
  assert.equal(stale.verdict, "MISMATCH");
  assert.deepEqual(stale.differences, [{ field: "games", site: 74, espn: 76 }]);
  // A real ppg difference and a listed drift: both listed.
  const both = compareSeason(siteNoBox(76, 24.96, noBox(80, 70, 1747, 41)), nbaEspn(76, 30.0), nba);
  assert.deepEqual(both.differences.map((d) => d.field), ["games (listed)", "ppg"]);
});

test("NBA no box score: only for the NBA, and only when ESPN gives games played", () => {
  // No league (or the NFL): the shortfall is an ordinary ppg mismatch.
  assert.equal(compareSeason(siteNoBox(76, 24.96, seventy), nbaEspn(76, 25.3)).verdict, "MISMATCH");
  assert.equal(compareSeason(siteNoBox(76, 24.96, seventy), nbaEspn(76, 25.3), { league: "nfl" }).verdict, "MISMATCH");
  // ESPN's games played absent: games are unverified, and a ppg difference fails as before.
  assert.equal(compareSeason(siteNoBox(76, 25.3, seventy), nbaEspn(null, 25.3), nba).verdict, "games not verified");
  assert.equal(compareSeason(siteNoBox(76, 24.96, seventy), nbaEspn(null, 25.3), nba).verdict, "MISMATCH");
});

test("NBA no box score: a season ESPN has no row for is 'no ESPN row', whatever the shortfall", () => {
  assert.equal(compareSeason(siteNoBox(6, null, noBox(6, 0, 0, 0)), null, nba).verdict, "no ESPN row");
  assert.equal(compareSeason({ games: 6, gamesSource: "listed", figures: { ppg: null } }, null, nba).verdict, "no ESPN row");
  assert.equal(compareSeason(siteNoBox(6, null, noBox(6, 0, 0, 0)), null, { league: "nba", requireEspnRow: true }).verdict, "MISMATCH");
});

test("NBA no box score: a season with no recorded game has no best game, so no missing game can hold a point", () => {
  // Nothing recorded: bestGame 0, so no missing game can hold a point; an ESPN average above tol fails.
  assert.equal(compareSeason(siteNoBox(6, null, noBox(6, 0, 0, 0)), nbaEspn(6, 12.0), nba).verdict, "MISMATCH");
  assert.equal(compareSeason(siteNoBox(6, null, noBox(6, 0, 0, 0)), nbaEspn(6, 0), nba).verdict, "match");
});

// -- reading ESPN's payload ---------------------------------------------------------------------

test("espnFigures reads NBA games and points per game from the averages category", () => {
  const stored = { averages: { labels: ["GP", "GS", "PTS"], values: ["50", "50", "28.2"] }, totals: { labels: ["PTS"], values: ["1,408"] } };
  assert.deepEqual(espnFigures("nba", stored), { games: 50, figures: { ppg: 28.2 } });
  assert.equal(espnFigures("nba", {}), null);
});

test("espnFigures reads NFL yards and touchdowns per category and the largest GP", () => {
  const stored = {
    passing: { labels: ["GP", "CMP", "YDS", "TD"], values: ["14", "315", "3,587", "22"] },
    rushing: { labels: ["GP", "CAR", "YDS", "AVG", "TD"], values: ["14", "64", "422", "6.6", "5"] },
  };
  assert.deepEqual(espnFigures("nfl", stored), {
    games: 14,
    figures: { passYds: 3587, passTd: 22, rushYds: 422, rushTd: 5, recYds: null, recTd: null },
  });
});

test("espnFigures: for the NFL a games figure (the loader's) overrides the categories' GP, a null falls back to it", () => {
  const stored = {
    passing: { labels: ["GP", "YDS", "TD"], values: ["11", "3,000", "20"] },
    rushing: { labels: ["GP", "YDS", "TD"], values: ["11", "100", "1"] },
  };
  assert.equal(espnFigures("nfl", stored, 17)?.games, 17);
  assert.deepEqual(espnFigures("nfl", stored, 17)?.figures, { passYds: 3000, passTd: 20, rushYds: 100, rushTd: 1, recYds: null, recTd: null });
  assert.equal(espnFigures("nfl", stored, null)?.games, 11);
  assert.equal(espnFigures("nfl", stored, undefined)?.games, 11);
  assert.equal(espnFigures("nfl", stored)?.games, 11);
  // A row with no readable GP at all takes the loader's figure too.
  assert.equal(espnFigures("nfl", { rushing: { labels: ["YDS"], values: ["100"] } }, 9)?.games, 9);
});

test("espnFigures: the NBA ignores a games figure", () => {
  const stored = { averages: { labels: ["GP", "PTS"], values: ["50", "28.2"] } };
  assert.deepEqual(espnFigures("nba", stored, 99), { games: 50, figures: { ppg: 28.2 } });
});

// Robinson-shaped: a traded player whose payload has a row per team and no Totals row (3 games, then 1).
const tradedNoTotals = [
  { name: "passing", labels: ["GP", "CMP", "YDS", "TD"], statistics: [{ season: { year: 2025 }, teamSlug: "a", stats: ["3", "10", "100", "1"] }, { season: { year: 2025 }, teamSlug: "b", stats: ["1", "2", "20", "0"] }] },
  { name: "rushing", labels: ["GP", "CAR", "YDS", "TD"], statistics: [{ season: { year: 2025 }, teamSlug: "a", stats: ["3", "5", "30", "0"] }, { season: { year: 2025 }, teamSlug: "b", stats: ["1", "1", "4", "0"] }, { season: { year: 2024 }, teamSlug: "a", stats: ["17", "9", "60", "1"] }] },
];

test("gamesPlayedFromPayload gives the loader's games per year: a traded player without a Totals row sums the stints (3 + 1)", () => {
  const games = gamesPlayedFromPayload(tradedNoTotals, 2016);
  assert.deepEqual([...games.entries()].sort(), [[2024, 17], [2025, 4]]);
  // The seasons the audit reads are the same years.
  assert.deepEqual([...seasonsFromPayload(tradedNoTotals, seasonRow, 2016).keys()].sort(), [2024, 2025]);
  // The first-stint category row alone would say 3: that is the figure the audit no longer uses.
  assert.equal(espnFigures("nfl", seasonsFromPayload(tradedNoTotals, seasonRow, 2016).get(2025)!)?.games, 3);
  assert.equal(espnFigures("nfl", seasonsFromPayload(tradedNoTotals, seasonRow, 2016).get(2025)!, games.get(2025))?.games, 4);
});

test("gamesPlayedFromPayload takes the Totals row's GP when the payload has one, and only years from minYear", () => {
  const withTotals = [
    {
      name: "rushing",
      labels: ["GP", "CAR", "YDS", "TD"],
      statistics: [
        { season: { year: 2009 }, teamSlug: "a", stats: ["16", "1", "1", "0"] },
        { season: { year: 2022 }, teamSlug: "car", stats: ["6", "5", "30", "0"] },
        { season: { year: 2022 }, teamSlug: "sf", stats: ["11", "9", "60", "1"] },
        { season: { year: 2022 }, teamSlug: "2022 Totals", displayName: "2022  Totals", stats: ["17", "14", "90", "1"] },
      ],
    },
  ];
  assert.deepEqual([...gamesPlayedFromPayload(withTotals, 2016).entries()], [[2022, 17]]);
});

test("gamesPlayedFromPayload is null for a year with no readable GP, and for a GP of 0 (the loader stores neither)", () => {
  const noGp = [{ name: "rushing", labels: ["YDS"], statistics: [{ season: { year: 2025 }, teamSlug: "a", stats: ["50"] }] }];
  assert.deepEqual([...gamesPlayedFromPayload(noGp, 2016).entries()], [[2025, null]]);
  const zero = [{ name: "rushing", labels: ["GP", "YDS"], statistics: [{ season: { year: 2025 }, teamSlug: "a", stats: ["0", "0"] }] }];
  assert.deepEqual([...gamesPlayedFromPayload(zero, 2016).entries()], [[2025, null]]);
});

test("seasonsFromPayload reads every season in the window through the loader's seasonRow, a traded season from its Totals row", () => {
  const payload = [
    {
      name: "averages",
      labels: ["GP", "PTS"],
      statistics: [
        { season: { year: 2009 }, teamSlug: "a", stats: ["10", "5.0"] },
        { season: { year: 2025 }, teamSlug: "a", stats: ["22", "28.1"] },
        { season: { year: 2025 }, teamSlug: "b", stats: ["28", "28.2"] },
        { season: { year: 2025 }, teamSlug: "2024-25 Totals", stats: ["50", "28.2"] },
      ],
    },
    { displayName: "Totals", labels: ["PTS"], statistics: [{ season: { year: 2025 }, stats: ["1,408"] }] },
  ];
  const seasons = seasonsFromPayload(payload, seasonRow, 2016);
  assert.deepEqual([...seasons.keys()], [2025]);
  const stored = seasons.get(2025)!;
  assert.deepEqual(Object.keys(stored), ["averages", "Totals"]);
  assert.deepEqual(espnFigures("nba", stored), { games: 50, figures: { ppg: 28.2 } });
});

// -- the site's side ----------------------------------------------------------------------------

function row(id: string, date: string, stage: GameStage, season: number, stats: Stats): PlayerLogRow {
  return {
    game_espn_id: id, date, season_year: season, round: null, week: null, stage, season_type: null, competition_type: null,
    is_home: true, team_espn_id: "1", team_name: "Home", team_slug: "home", team_abbr: "HOM", team_logo: null,
    opponent_espn_id: "2", opponent_name: "Away", opponent_slug: "away", opponent_abbr: "AWY", opponent_logo: null,
    team_score: 100, opponent_score: 90, result: "W", stats,
  };
}

test("siteSeasons counts regular-season games only, per season", () => {
  const box = (pts: number): Stats => ({ box: { MIN: "30", PTS: String(pts) } });
  const rows = [
    row("a", "2025-01-01", "regular", 2025, box(20)),
    row("b", "2025-01-03", "regular", 2025, box(30)),
    row("c", "2025-04-20", "playoffs", 2025, box(50)),
    row("d", "2025-04-15", "playin", 2025, box(40)),
    row("e", "2025-10-05", "excluded", 2026, box(15)),
    row("f", "2026-01-01", "regular", 2026, box(10)),
  ];
  const seasons = siteSeasons("nba", buildStagedProfile("nba", rows).regular);
  assert.deepEqual([...seasons.keys()].sort(), [2025, 2026]);
  assert.deepEqual(seasons.get(2025), { games: 2, figures: { ppg: 25 } });
  assert.deepEqual(seasons.get(2026), { games: 1, figures: { ppg: 10 } });
});

test("siteSeasons sums NFL yards and touchdowns for the season, including categories the page does not show", () => {
  const passer = (yds: number, td: number): Stats => ({ passing: { "C/ATT": "20/30", YDS: String(yds), TD: String(td) }, rushing: { CAR: "1", YDS: "5", TD: "0" } });
  const rows = [
    row("a", "2025-09-07", "regular", 2025, passer(300, 2)),
    row("b", "2025-09-14", "regular", 2025, passer(250, 1)),
    row("c", "2026-01-11", "playoffs", 2025, passer(400, 4)),
  ];
  const seasons = siteSeasons("nfl", buildStagedProfile("nfl", rows).regular);
  assert.deepEqual(seasons.get(2025), { games: 2, gamesSource: "logged", figures: { passYds: 550, passTd: 3, rushYds: 10, rushTd: 0, recYds: 0, recTd: 0 } });
});

test("siteSeasons carries each NFL season's gamesSource: ESPN's stored figure, or the logged count", () => {
  const line: Stats = { rushing: { CAR: "5", YDS: "20", TD: "0" } };
  const rows = [
    row("a", "2024-09-08", "regular", 2024, line),
    row("b", "2025-09-07", "regular", 2025, line),
    row("c", "2025-09-14", "regular", 2025, line),
  ];
  // 2025 has a stored figure (16, above the 2 logged games); 2024 has none.
  const seasons = siteSeasons("nfl", buildStagedProfile("nfl", rows, new Map([[2025, 16]])).regular);
  assert.equal(seasons.get(2025)?.games, 16);
  assert.equal(seasons.get(2025)?.gamesSource, "espn");
  assert.equal(seasons.get(2024)?.games, 1);
  assert.equal(seasons.get(2024)?.gamesSource, "logged");
  // Through the comparison: 2024 is games short against ESPN's 16, 2025 matches.
  const espn: SeasonFigures = { games: 16, figures: { passYds: 0, passTd: 0, rushYds: 20, rushTd: 0, recYds: 0, recTd: 0 } };
  assert.equal(compareSeason(seasons.get(2024)!, { ...espn, figures: { ...espn.figures, rushYds: 20 } }, { league: "nfl" }).verdict, "games short (no stat line)");
  assert.equal(compareSeason(seasons.get(2025)!, { ...espn, figures: { ...espn.figures, rushYds: 40 } }, { league: "nfl" }).verdict, "match");
});

test("siteSeasons leaves an NBA season's gamesSource out", () => {
  const seasons = siteSeasons("nba", buildStagedProfile("nba", [row("a", "2025-01-01", "regular", 2025, { box: { MIN: "30", PTS: "20" } })]).regular);
  assert.ok(!("gamesSource" in seasons.get(2025)!));
});

test("a season with only playoff box scores has no regular-season games: no box scores, not a match", () => {
  const box = (pts: number): Stats => ({ box: { MIN: "30", PTS: String(pts) } });
  const rows = [row("p1", "2025-04-20", "playoffs", 2025, box(40)), row("p2", "2025-04-25", "playoffs", 2025, box(30))];
  const seasons = siteSeasons("nba", buildStagedProfile("nba", rows).regular);
  const site = siteSeasonOrEmpty(seasons, 2025);
  assert.deepEqual(site, { games: 0, figures: {} });
  assert.equal(compareSeason(site, nbaEspn(70, 27.0), { league: "nba" }).verdict, "no box scores");
});

test("siteSeasons sets noBoxScore on an NBA season with games ESPN published no box score for, and leaves it out otherwise", () => {
  const box = (pts: number): Stats => ({ box: { MIN: "30", PTS: String(pts) } });
  const blank: Stats = { box: { MIN: "--", PTS: "--" } };
  const noBoxRow = (id: string, date: string, stage: GameStage, season: number): PlayerLogRow => ({ ...row(id, date, stage, season, blank), no_box_score: true });
  const rows = [
    row("a", "2025-01-01", "regular", 2025, box(20)),
    row("b", "2025-01-03", "regular", 2025, box(30)),
    row("c", "2025-01-05", "regular", 2025, { box: { MIN: "12", PTS: "--" } }), // played, points blank: counts as 0
    row("d", "2025-01-07", "regular", 2025, box(10)),
    noBoxRow("x", "2025-01-09", "regular", 2025),
    noBoxRow("y", "2025-01-11", "regular", 2025),
    noBoxRow("z", "2025-04-20", "playoffs", 2025), // not a regular-season game
    row("e", "2026-01-01", "regular", 2026, box(10)),
  ];
  // ESPN's stored games played for 2025 is 6 (4 with a line and 2 without); it is the games shown, and not the listed count.
  const seasons = siteSeasons("nba", buildStagedProfile("nba", rows, new Map([[2025, 6]])).regular);
  assert.deepEqual(seasons.get(2025), {
    games: 6,
    figures: { ppg: 20 }, // the page's own average, which skips a blank PTS (60 over 3), unchanged by this
    noBoxScore: { listed: 6, recorded: 4, points: 60, bestGame: 30 },
  });
  // The ordinary season carries no noBoxScore key at all.
  assert.deepEqual(seasons.get(2026), { games: 1, figures: { ppg: 10 } });
  // A season with games listed and none recorded: no figure stored, so the listed count is shown.
  const only = siteSeasons("nba", buildStagedProfile("nba", [noBoxRow("x", "2025-01-09", "regular", 2025), noBoxRow("y", "2025-01-11", "regular", 2025)]).regular);
  assert.deepEqual(only.get(2025), { games: 2, figures: { ppg: null }, noBoxScore: { listed: 2, recorded: 0, points: 0, bestGame: 0 } });
});

test("siteSeasons and compareSeason together: a season the page shows with ESPN's games and the recorded average is explained", () => {
  const box = (pts: number): Stats => ({ box: { MIN: "30", PTS: String(pts) } });
  const blank: Stats = { box: { MIN: "--", PTS: "--" } };
  const rows = [
    row("a", "2025-01-01", "regular", 2025, box(20)),
    row("b", "2025-01-03", "regular", 2025, box(30)),
    { ...row("x", "2025-01-09", "regular", 2025, blank), no_box_score: true },
  ];
  const site = siteSeasons("nba", buildStagedProfile("nba", rows, new Map([[2025, 3]])).regular).get(2025)!;
  // ESPN: 3 games at 26.0 a game = 78; the site has 50 over 2 games, the third game could hold up to 30.
  assert.equal(compareSeason(site, nbaEspn(3, 26.0), nba).verdict, "explained (no box score)");
  assert.equal(compareSeason(site, nbaEspn(3, 34.0), nba).verdict, "MISMATCH"); // 102 - 50 = 52 > 30 + 0.15
  // ESPN's stored games, as the page shows them, are ESPN's own: the listed count (3) matches.
  assert.equal(compareSeason(site, nbaEspn(4, 30.0), nba).verdict, "MISMATCH"); // shown 3, ESPN 4
});

test("tradedSeasons lists the seasons a player's regular-season games span several teams", () => {
  const box: Stats = { box: { MIN: "30", PTS: "20" } };
  const other = (r: PlayerLogRow): PlayerLogRow => ({ ...r, team_espn_id: "9", team_name: "Other", team_slug: "other" });
  const rows = [
    row("a", "2025-01-01", "regular", 2025, box),
    other(row("b", "2025-02-01", "regular", 2025, box)),
    row("c", "2026-01-01", "regular", 2026, box),
  ];
  assert.deepEqual([...tradedSeasons(buildStagedProfile("nba", rows).regular)], [2025]);
});

// -- command line -------------------------------------------------------------------------------

test("parseArgs: defaults, league, --live, --limit and --strict", () => {
  assert.deepEqual(parseArgs([]), { leagues: ["nba", "nfl"], live: null, limit: null, strict: false });
  assert.deepEqual(parseArgs(["nfl", "--live", "5", "--limit", "20"]), { leagues: ["nfl"], live: 5, limit: 20, strict: false });
  assert.deepEqual(parseArgs(["--limit", "3", "nba"]), { leagues: ["nba"], live: null, limit: 3, strict: false });
  assert.deepEqual(parseArgs(["--strict", "nba"]), { leagues: ["nba"], live: null, limit: null, strict: true });
  assert.deepEqual(parseArgs(["--limit", "100000"]), { leagues: ["nba", "nfl"], live: null, limit: 100000, strict: false });
});

test("parseArgs rejects an unknown league, a non-numeric, missing or over-cap N, and unknown flags", () => {
  const bads = [["epl"], ["--live", "abc"], ["--limit", "0"], ["--live"], ["--limit", "-2"], ["--bogus"], ["nba", "nfl"], ["--limit", "100001"], ["--live", "99999999999"], ["--strict", "yes"]];
  for (const bad of bads) assert.ok("error" in parseArgs(bad), `expected an error for ${bad.join(" ")}`);
  const over = parseArgs(["--limit", "100001"]);
  assert.ok("error" in over && /100000/.test(over.error));
});

test("USAGE documents --strict and how --live and --limit combine", () => {
  assert.match(USAGE, /--strict/);
  assert.match(USAGE, /--live N --limit M/);
});

test("USAGE says the explained (no box score) class never fails the run, --strict included", () => {
  assert.match(USAGE, /explained \(no box score\)/);
});
