// Player figures that must read like the reference sites: NBA minutes per game and playoff lines from ESPN's own
// rows, and the NFL passer rating and kicker points computed from totals.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildProfile, buildStagedProfile, formatStat, noBoxScoreGames, sportProfile, type PlayerLogRow, type Stats } from "../src/lib/playerProfile";
import { EspnSeasons, espnSeasonTotals, type EspnSeasonTotals } from "../src/lib/espnSeason";
import { kickerPoints, passerRating } from "../src/lib/playerDerived";
import butler from "./fixtures/espn-nba-butler-6430-stats.json";

function row(id: string, date: string, stats: Stats, o: { season?: number; stage?: PlayerLogRow["stage"]; noBox?: boolean } = {}): PlayerLogRow {
  return {
    game_espn_id: id, date, season_year: o.season ?? 2025, round: null, week: null, stage: o.stage ?? "regular", season_type: 2, competition_type: "STD",
    is_home: true, team_espn_id: "1", team_name: "Home", team_slug: "home", team_abbr: "HOM", team_logo: null,
    opponent_espn_id: "2", opponent_name: "Away", opponent_slug: "away", opponent_abbr: "AWY", opponent_logo: null,
    team_score: 100, opponent_score: 90, result: "W", stats, ...(o.noBox ? { no_box_score: true } : {}),
  };
}

const espnLine = (o: Partial<EspnSeasonTotals> = {}): EspnSeasonTotals => ({
  games: 10, starts: 10, minutesPerGame: 33.2, pts: 250, reb: 60, ast: 50, stl: 10, blk: 5, to: 20,
  fgm: 90, fga: 190, tpm: 20, tpa: 50, ftm: 30, fta: 40, ...o,
});
const nbaStats = (min: string, pts: string): Stats => ({ box: { GS: "1", MIN: min, PTS: pts, REB: "5", AST: "4", STL: "1", BLK: "0", TO: "2", FG: "5-10", "3PT": "1-3", FT: "2-2", "+/-": "+1" } });
const dnp: Stats = { box: { MIN: "--", PTS: "0", REB: "0", AST: "0" } };
/** `mins.length` recorded rows, one per minutes value, dated across the given month of a season. */
const nbaGames = (mins: string[], o: { season?: number; stage?: PlayerLogRow["stage"]; prefix?: string; month?: string } = {}) =>
  mins.map((m, i) => row(`${o.prefix ?? "g"}${i}`, `${o.season ?? 2025}-${o.month ?? "01"}-${String(i + 1).padStart(2, "0")}`, nbaStats(m, "20"), o));
const listedRows = (n: number, o: { season?: number; stage?: PlayerLogRow["stage"]; prefix?: string } = {}) =>
  Array.from({ length: n }, (_, i) => row(`${o.prefix ?? "u"}${i}`, `${o.season ?? 2025}-02-${String(i + 1).padStart(2, "0")}`, dnp, { ...o, noBox: true }));
const near = (actual: number | null, expected: number) => assert.ok(actual !== null && Math.abs(actual - expected) < 1e-9, `${actual} is not ${expected}`);

// ---------------------------------------------------------------------------
// Item 1: minutes per game come from ESPN's season row when it covers exactly the games we have.
// ---------------------------------------------------------------------------
test("MIN per game: whole-minute box cells average 33.1, ESPN's season row says 33.2, and the season shows 33.2", () => {
  const rows = nbaGames(["33", "33", "33", "33", "33", "33", "33", "33", "33", "34"]);
  const without = buildProfile("nba", rows);
  near(without.seasons[0].line.min, 33.1);
  const p = buildProfile("nba", rows, rows, undefined, new Map([[2025, espnLine({ games: 10, minutesPerGame: 33.2 })]]));
  assert.equal(p.seasons[0].line.min, 33.2);
  assert.equal(p.seasons[0].lineSource, "box");
  // Everything else on the line is still the box-score figure.
  assert.equal(p.seasons[0].line.pts, without.seasons[0].line.pts);
  assert.equal(p.seasons[0].games, 10);
});

test("MIN per game: the career figure is the games-weighted mean of the seasons' figures", () => {
  const rows = [...nbaGames(["33", "33", "33", "33", "33", "33", "33", "33", "33", "34"]), ...nbaGames(["30", "30", "30", "30", "30"], { season: 2024, prefix: "h" })];
  // 2025 takes ESPN's 33.2 over 10 games; 2024 has no ESPN row and stays at its box mean of 30 over 5 games.
  const one = buildProfile("nba", rows, rows, undefined, new Map([[2025, espnLine({ games: 10, minutesPerGame: 33.2 })]]));
  near(one.career.min, (33.2 * 10 + 30 * 5) / 15);
  // Both seasons from ESPN.
  const two = buildProfile("nba", rows, rows, undefined, new Map([[2025, espnLine({ games: 10, minutesPerGame: 33.2 })], [2024, espnLine({ games: 5, minutesPerGame: 30.4 })]]));
  assert.equal(two.seasons[0].line.min, 33.2);
  assert.equal(two.seasons[1].line.min, 30.4);
  near(two.career.min, (33.2 * 10 + 30.4 * 5) / 15);
  // No ESPN row: exactly today's career mean of the box cells.
  near(buildProfile("nba", rows).career.min, (33 * 9 + 34 + 30 * 5) / 15);
});

test("MIN per game: ESPN's figure is used only when its games equal the logged games and none is unrecorded", () => {
  const rows = nbaGames(["33", "33", "33", "33", "33", "33", "33", "33", "33", "34"]);
  // ESPN counts fewer games than are logged: a stale row, not used.
  near(buildProfile("nba", rows, rows, undefined, new Map([[2025, espnLine({ games: 9, minutesPerGame: 33.2 })]])).seasons[0].line.min, 33.1);
  // A game with no box score in the season: the ESPN row is not the same set of games as the box rows.
  const withUnrecorded = [...rows, ...listedRows(1)];
  const long = buildProfile("nba", withUnrecorded, withUnrecorded, undefined, new Map([[2025, espnLine({ games: 10, minutesPerGame: 33.2 })]]));
  near(long.seasons[0].line.min, 33.1);
  // No minutes in ESPN's row: the box mean stands.
  near(buildProfile("nba", rows, rows, undefined, new Map([[2025, espnLine({ games: 10, minutesPerGame: null })]])).seasons[0].line.min, 33.1);
  // Through the staged profile the regular season takes ESPN's minutes the same way.
  const staged = buildStagedProfile("nba", rows, undefined, new Map([[2025, espnLine({ games: 10, minutesPerGame: 33.2 })]]));
  assert.equal(staged.regular.seasons[0].line.min, 33.2);
});

// ---------------------------------------------------------------------------
// Item 2: playoff seasons built from partial box scores.
// ---------------------------------------------------------------------------
const postseason = (categories: unknown, prefix = "postseason_") => espnSeasonTotals(categories, prefix);

test("espnSeasonTotals reads the postseason_ keys with a prefix, and never the regular-season keys with one", () => {
  const cats = (k: "regular" | "postseason") =>
    Object.fromEntries(butler[k].categories.filter((c) => c.name !== "miscellaneous").map((c) => [`${k === "postseason" ? "postseason_" : ""}${c.name}`, { labels: c.labels, values: c.statistics.find((s) => s.season.year === 2017)!.stats }]));
  const stored = { ...cats("regular"), ...cats("postseason") };
  const po = postseason(stored);
  assert.ok(po);
  assert.equal(po.games, 6);
  assert.equal(po.starts, 6);
  assert.equal(po.minutesPerGame, 39.8);
  assert.equal(po.pts, 136);
  assert.equal(po.reb, 44);
  assert.equal(po.ast, 26);
  assert.equal(po.fgm, 46);
  assert.equal(po.fga, 108);
  // Butler 2016-17 regular season is the row without a prefix.
  const reg = espnSeasonTotals(stored);
  assert.equal(reg?.games, 76);
  assert.equal(reg?.minutesPerGame, 37);
  // A row with only regular-season keys has no postseason line.
  assert.equal(postseason(cats("regular")), null);
  assert.equal(postseason(null), null);
});

/** Butler 2016-17: 1 game with a box score of 6, and ESPN's postseason row for the 6. */
const BUTLER_PO_2017 = espnLine({ games: 6, starts: 6, minutesPerGame: 39.8, pts: 136, reb: 44, ast: 26, stl: 10, blk: 5, to: 15, fgm: 46, fga: 108, tpm: 6, tpa: 23, ftm: 38, fta: 47 });
const partialPlayoffs = () => [
  row("po1", "2017-04-16", nbaStats("40", "30"), { season: 2017, stage: "playoffs" }),
  ...listedRows(5, { season: 2017, stage: "playoffs", prefix: "pu" }),
];
const regular2017 = () => nbaGames(["37", "37", "37"], { season: 2017, stage: "regular", prefix: "r", month: "01" });

test("a playoff season with 1 logged game of 6 and a postseason ESPN row shows ESPN's line with the dagger kept and W-L blank", () => {
  const espn = new EspnSeasons([], [[2017, BUTLER_PO_2017]]);
  const s = buildStagedProfile("nba", [...regular2017(), ...partialPlayoffs()], undefined, espn);
  const po = s.playoffs!.seasons[0];
  assert.equal(po.lineSource, "espn");
  assert.equal(po.games, 6);
  assert.equal(po.gamesSource, "espn");
  assert.equal(po.recorded, 1);
  assert.equal(po.record, null);
  assert.equal(po.line.min, 39.8);
  assert.equal(po.line.gs, 6);
  near(po.line.pts, 136 / 6);
  near(po.line.reb, 44 / 6);
  near(po.line.fg_pct, (100 * 46) / 108);
  // The dagger: games beyond the recorded ones.
  assert.equal(noBoxScoreGames("nba", po.games, po.recorded), 5);
  // The playoffs career is ESPN's totals over ESPN's games.
  near(s.playoffs!.career.pts, 136 / 6);
  assert.equal(s.playoffs!.career.min, 39.8);
  // The regular season is untouched by the postseason map.
  assert.equal(s.regular.seasons[0].lineSource, "box");
  assert.equal(s.regular.seasons[0].line.min, 37);
  assert.equal(s.regular.seasons[0].games, 3);
});

test("a regular-season ESPN row is not used for the playoffs, nor the postseason row for the regular season", () => {
  const regularOnly = new EspnSeasons([[2017, BUTLER_PO_2017]], []);
  const s = buildStagedProfile("nba", [...regular2017(), ...partialPlayoffs()], undefined, regularOnly);
  assert.equal(s.playoffs!.seasons[0].lineSource, "box");
  const both = new EspnSeasons([], [[2017, BUTLER_PO_2017]]);
  assert.equal(buildStagedProfile("nba", [...regular2017(), ...partialPlayoffs()], undefined, both).regular.seasons[0].lineSource, "box");
});

test("interim rule: a stage season short of games with no ESPN line shows dashes, not a partial-sample average", () => {
  const s = buildStagedProfile("nba", [...regular2017(), ...partialPlayoffs()]);
  const po = s.playoffs!.seasons[0];
  assert.equal(po.games, 6);
  assert.equal(po.recorded, 1);
  assert.equal(po.lineSource, "box");
  assert.equal(po.record, null);
  for (const spec of sportProfile("nba", []).specs) assert.equal(po.line[spec.key], null, spec.key);
  assert.equal(noBoxScoreGames("nba", po.games, po.recorded), 5);
  // The career carries the same dashes rather than the partial sample.
  for (const spec of sportProfile("nba", []).specs) assert.equal(s.playoffs!.career[spec.key], null, spec.key);
  // The regular season, with no unrecorded game, is untouched.
  assert.equal(s.regular.seasons[0].line.pts, 20);
  // A play-in season short of games has no ESPN line to use and takes the same rule.
  const playin = buildStagedProfile("nba", [row("pi", "2017-04-10", nbaStats("30", "20"), { season: 2017, stage: "playin" }), ...listedRows(1, { season: 2017, stage: "playin", prefix: "pi" })]);
  assert.equal(playin.playin!.seasons[0].line.pts, null);
  assert.equal(playin.playin!.seasons[0].games, 2);
});

test("interim rule: a stage season whose games all have box scores, and the regular season with unrecorded games, keep their averages", () => {
  const complete = buildStagedProfile("nba", [...regular2017(), ...nbaGames(["40", "40"], { season: 2017, stage: "playoffs", prefix: "p", month: "04" })]);
  assert.equal(complete.playoffs!.seasons[0].line.pts, 20);
  assert.equal(complete.playoffs!.career.pts, 20);
  // The regular season keeps its box average over the recorded games even with unrecorded games (its ESPN row is the fix there).
  const regularShort = buildStagedProfile("nba", [...regular2017(), ...listedRows(2, { season: 2017, stage: "regular", prefix: "ru" })]);
  assert.equal(regularShort.regular.seasons[0].line.pts, 20);
  assert.equal(regularShort.regular.seasons[0].games, 5);
});

test("a stage season where ESPN counts the same games as the log keeps the box line, with ESPN's exact minutes", () => {
  const rows = nbaGames(["40", "40", "41"], { season: 2017, stage: "playoffs", prefix: "p", month: "04" });
  const espn = new EspnSeasons([], [[2017, espnLine({ games: 3, minutesPerGame: 40.4 })]]);
  const po = buildStagedProfile("nba", [...regular2017(), ...rows], undefined, espn).playoffs!.seasons[0];
  assert.equal(po.lineSource, "box");
  assert.equal(po.line.min, 40.4);
  assert.equal(po.line.pts, 20);
});

// ---------------------------------------------------------------------------
// Item 5: passer rating from the line's totals.
// ---------------------------------------------------------------------------
test("passerRating: Mahomes 2024 (392/581, 3,928 yards, 26 TD, 11 INT) is 93.5", () => {
  assert.equal(passerRating(392, 581, 3928, 26, 11), 93.5);
});

test("passerRating: the perfect rating, each component clamped, and no attempts", () => {
  // 158.3 needs every component at 2.375: 77.5% completions, 12.5 yards, 11.875% touchdowns, no interceptions.
  assert.equal(passerRating(31, 40, 500, 5, 0), 158.3);
  // A huge game cannot go past 158.3.
  assert.equal(passerRating(10, 10, 400, 6, 0), 158.3);
  // Every component below zero is 0: a rating of exactly 0.
  assert.equal(passerRating(0, 20, -10, 0, 8), 0);
  // One component negative (interceptions: 2.375 - 25 x 3/10 < 0) is clamped to 0 while the others stand.
  // a = (0.6 - 0.3) x 5 = 1.5, b = (6 - 3) x 0.25 = 0.75, c = 0.1 x 20 = 2, d = 0.
  assert.equal(passerRating(6, 10, 60, 1, 3), Math.round(((1.5 + 0.75 + 2 + 0) / 6) * 1000) / 10);
  // No attempts: no rating.
  assert.equal(passerRating(0, 0, 0, 0, 0), null);
});

const pass = (c: number, att: number, yds: number, td: number, int: number, rtg: string): Stats => ({ passing: { "C/ATT": `${c}/${att}`, YDS: String(yds), TD: String(td), INT: String(int), RTG: rtg } });
const QB = [
  row("q1", "2024-09-05", pass(200, 300, 2000, 13, 5, "90.0"), { season: 2024 }),
  row("q2", "2024-09-12", pass(192, 281, 1928, 13, 6, "95.0"), { season: 2024 }),
  row("q3", "2023-09-10", pass(100, 150, 1000, 8, 2, "100.0"), { season: 2023 }),
];

test("passer rating: season, career and split lines are computed from the totals, not the mean of the game ratings", () => {
  const p = buildProfile("nfl", QB);
  const s2024 = p.seasons.find((s) => s.season === 2024)!;
  // Totals 392/581, 3,928 yards, 26 TD, 11 INT.
  assert.equal(s2024.line.pass_rtg, 93.5);
  // The mean of the two game ratings would be 92.5.
  assert.notEqual(s2024.line.pass_rtg, 92.5);
  assert.equal(p.career.pass_rtg, passerRating(492, 731, 4928, 34, 13));
  const wins = p.byResult.find((x) => x.key === "w")!;
  assert.equal(wins.line.pass_rtg, passerRating(492, 731, 4928, 34, 13));
  const home = p.homeAway.find((x) => x.key === "home")!;
  assert.equal(home.line.pass_rtg, passerRating(492, 731, 4928, 34, 13));
  // The game log keeps ESPN's per-game figure.
  const spec = p.profile.specs.find((x) => x.key === "pass_rtg")!;
  assert.equal(spec.value(QB[0].stats), 90);
  assert.equal(formatStat(spec, s2024.line.pass_rtg), "93.5");
});

test("passer rating: a season with no attempts shows a dash", () => {
  const p = buildProfile("nfl", [row("q0", "2024-09-05", { passing: { "C/ATT": "0/0", YDS: "0", TD: "0", INT: "0", RTG: "0.0" } }, { season: 2024 }), ...QB.slice(2)]);
  assert.equal(p.seasons.find((s) => s.season === 2024)!.line.pass_rtg, null);
});

// ---------------------------------------------------------------------------
// Item 6: kicker points are 3 x FGM + XPM.
// ---------------------------------------------------------------------------
test("kickerPoints is three per field goal plus one per extra point", () => {
  assert.equal(kickerPoints(2, 4), 10);
  assert.equal(kickerPoints(0, 0), 0);
  assert.equal(kickerPoints(40, 60), 180);
});

const kick = (fg: string, xp: string, pts: string): Stats => ({ kicking: { FG: fg, XP: xp, LONG: "45", PTS: pts } });

test("kicker points: FG 2/4, XP 4/4 with a box PTS of 9 is 10 in the season line", () => {
  const rows = [row("k1", "2024-09-08", kick("2/4", "4/4", "9"), { season: 2024 }), row("k2", "2024-09-15", kick("3/3", "1/1", "10"), { season: 2024 })];
  const p = buildProfile("nfl", rows);
  // 5 field goals and 5 extra points: 20, where summing ESPN's PTS cells gives 19.
  assert.equal(p.seasons[0].line.k_pts, 20);
  assert.equal(p.career.k_pts, 20);
  assert.equal(p.homeAway[0].line.k_pts, 20);
  // The game log still shows ESPN's figure for the game.
  const spec = p.profile.specs.find((x) => x.key === "k_pts")!;
  assert.equal(spec.value(rows[0].stats), 9);
});
