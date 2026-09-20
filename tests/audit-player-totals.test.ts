// The pure parts of the player-totals audit: no database, no network.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  compareSeason,
  espnFigures,
  parseArgs,
  seasonsFromPayload,
  siteSeasons,
  withTotalsRow,
  type SeasonFigures,
} from "../scripts/lib/audit-player-totals";
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

test("a season ESPN has no row for", () => {
  assert.equal(compareSeason(nbaSite(70, 27.0), null).verdict, "no ESPN row");
  // An ESPN row that carries none of the audited figures says nothing either.
  assert.equal(compareSeason(nbaSite(70, 27.0), nbaEspn(null, null)).verdict, "no ESPN row");
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

const nflSite = (games: number, figures: Record<string, number | null>): SeasonFigures => ({ games, figures });

test("NFL: equal yards and touchdowns match, a differing yard total is a MISMATCH", () => {
  const espn: SeasonFigures = { games: 17, figures: { passYds: 4183, passTd: 27, rushYds: 422, rushTd: 5, recYds: null, recTd: null } };
  assert.equal(compareSeason(nflSite(17, { passYds: 4183, passTd: 27, rushYds: 422, rushTd: 5, recYds: 0, recTd: 0 }), espn).verdict, "match");
  const r = compareSeason(nflSite(17, { passYds: 4183, passTd: 27, rushYds: 415, rushTd: 5, recYds: 0, recTd: 0 }), espn);
  assert.equal(r.verdict, "MISMATCH");
  assert.deepEqual(r.differences, [{ field: "rushYds", site: 415, espn: 422 }]);
});

test("NFL: games are only compared when ESPN's categories carry them", () => {
  const espn: SeasonFigures = { games: null, figures: { passYds: 100 } };
  assert.equal(compareSeason(nflSite(9, { passYds: 100 }), espn).verdict, "match");
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

test("a traded player's ESPN season is read from its Totals row, not the first team stint", () => {
  const category = {
    name: "averages",
    labels: ["GP", "PTS"],
    statistics: [
      { season: { year: 2024 }, teamSlug: "dallas-mavericks", stats: ["70", "33.9"] },
      { season: { year: 2025 }, teamSlug: "dallas-mavericks", stats: ["22", "28.1"] },
      { season: { year: 2025 }, teamSlug: "los-angeles-lakers", stats: ["28", "28.2"] },
      { season: { year: 2025 }, teamSlug: "2024-25 Totals", displayName: "2024-25  Totals", stats: ["50", "28.2"] },
    ],
  };
  assert.deepEqual(withTotalsRow(category, 2025).statistics.map((s) => s.stats[0]), ["50"]);
  // A season with one team keeps that row; other seasons are dropped.
  assert.deepEqual(withTotalsRow(category, 2024).statistics.map((s) => s.stats[0]), ["70"]);
  assert.deepEqual(withTotalsRow(category, 2030).statistics, []);
});

test("seasonsFromPayload reads every season in the window through the loader's row reader", () => {
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
  // The same lookup as the loader's seasonRow (first row for the year), without its league filter.
  const readRow = (c: { labels?: string[]; statistics?: { season?: { year?: number }; stats?: string[] }[] }, year: number) => {
    const row = (c.statistics ?? []).find((s) => s.season?.year === year);
    return row ? { labels: c.labels ?? [], values: row.stats ?? [] } : null;
  };
  const seasons = seasonsFromPayload(payload, readRow, 2016);
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
  assert.deepEqual(seasons.get(2025), { games: 2, figures: { passYds: 550, passTd: 3, rushYds: 10, rushTd: 0, recYds: 0, recTd: 0 } });
});

// -- command line -------------------------------------------------------------------------------

test("parseArgs: defaults, league, --live and --limit", () => {
  assert.deepEqual(parseArgs([]), { leagues: ["nba", "nfl"], live: null, limit: null });
  assert.deepEqual(parseArgs(["nfl", "--live", "5", "--limit", "20"]), { leagues: ["nfl"], live: 5, limit: 20 });
  assert.deepEqual(parseArgs(["--limit", "3", "nba"]), { leagues: ["nba"], live: null, limit: 3 });
});

test("parseArgs rejects an unknown league, a non-numeric or missing N, and unknown flags", () => {
  for (const bad of [["epl"], ["--live", "abc"], ["--limit", "0"], ["--live"], ["--limit", "-2"], ["--bogus"], ["nba", "nfl"]]) {
    assert.ok("error" in parseArgs(bad), `expected an error for ${bad.join(" ")}`);
  }
});
