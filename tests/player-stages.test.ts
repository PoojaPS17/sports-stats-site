import { test } from "node:test";
import assert from "node:assert/strict";
import { buildProfile, buildStagedProfile, type PlayerLogRow, type Stats } from "../src/lib/playerProfile";
import type { GameStage } from "../src/lib/gameStage";
import { careerStripStats, recordText } from "../src/components/PlayerStatsShared";

interface RowOptions {
  id: string;
  date: string;
  stage: GameStage;
  stats: Stats;
  season_type?: number | null;
  competition_type?: string | null;
  is_home?: boolean;
  season_year?: number | null;
}

function row(o: RowOptions): PlayerLogRow {
  return {
    game_espn_id: o.id,
    date: o.date,
    season_year: o.season_year === undefined ? 2026 : o.season_year,
    round: null,
    week: null,
    stage: o.stage,
    season_type: o.season_type === undefined ? null : o.season_type,
    competition_type: o.competition_type === undefined ? null : o.competition_type,
    is_home: o.is_home ?? true,
    team_espn_id: "1",
    team_name: "Home FC",
    team_slug: "home-fc",
    team_abbr: "HOM",
    team_logo: null,
    opponent_espn_id: "2",
    opponent_name: "Away FC",
    opponent_slug: "away-fc",
    opponent_abbr: "AWY",
    opponent_logo: null,
    team_score: 100,
    opponent_score: 90,
    result: "W",
    stats: o.stats,
  };
}

const nba = (pts: number, min = 30): Stats => ({ box: { MIN: String(min), PTS: String(pts), REB: "5", AST: "5" } });
// ESPN's bench-sheet DNP: on the sheet, every cell dashed. (MIN "0" is a sub-minute appearance and counts as a game.)
const nbaDnp: Stats = { box: { MIN: "--", PTS: "--", REB: "--", AST: "--" } };

const NBA_ROWS: PlayerLogRow[] = [
  row({ id: "r1", date: "2026-01-10", stage: "regular", season_type: 2, competition_type: "STD", stats: nba(10), is_home: true }),
  row({ id: "r2", date: "2026-01-20", stage: "regular", season_type: 2, competition_type: "STD", stats: nba(20), is_home: false }),
  row({ id: "r3", date: "2026-02-01", stage: "regular", season_type: 2, competition_type: "STD", stats: nba(30), is_home: true }),
  row({ id: "p1", date: "2026-04-20", stage: "playoffs", season_type: 3, competition_type: "QTR", stats: nba(40) }),
  row({ id: "p2", date: "2026-04-25", stage: "playoffs", season_type: 3, competition_type: "QTR", stats: nba(50) }),
  row({ id: "pi1", date: "2026-04-15", stage: "playin", season_type: 5, competition_type: "STD", stats: nba(25) }),
  row({ id: "cup", date: "2025-12-16", stage: "excluded", season_type: 2, competition_type: "CC", stats: nba(35) }),
  row({ id: "pre", date: "2025-10-05", stage: "excluded", season_type: 1, competition_type: "STD", stats: nba(15) }),
  row({ id: "dnp", date: "2026-02-10", stage: "regular", season_type: 2, competition_type: "STD", stats: nbaDnp }),
];

test("NBA: regular season, playoffs and play-in are separate tables; the log keeps excluded games", () => {
  const s = buildStagedProfile("nba", NBA_ROWS);
  assert.equal(s.split, true);

  assert.equal(s.regular.games, 3);
  assert.equal(s.regular.career.pts, 20);
  assert.equal(s.regular.seasons.length, 1);
  assert.equal(s.regular.seasons[0].games, 3);
  assert.equal(s.regular.seasons[0].line.pts, 20);

  assert.ok(s.playoffs);
  assert.equal(s.playoffs.games, 2);
  assert.equal(s.playoffs.career.pts, 45);

  assert.ok(s.playin);
  assert.equal(s.playin.games, 1);
  assert.equal(s.playin.career.pts, 25);

  // Regular season + playoffs + play-in; not the Cup final, the preseason game or the DNP.
  assert.equal(s.counted.games, 6);
  assert.equal(s.counted.best[0].game_espn_id, "p2");
  assert.equal(s.counted.form.length, 6);

  // 9 rows in; the DNP is not an appearance, the excluded rows stay in the log, newest first.
  assert.equal(NBA_ROWS.length, 9);
  assert.equal(s.log.length, 8);
  assert.deepEqual(
    s.log.map((r) => r.game_espn_id),
    ["p2", "p1", "pi1", "r3", "r2", "r1", "cup", "pre"]
  );

  // Home 2 (10, 30 pts) + away 1 (20 pts).
  const [home, away] = s.regular.homeAway;
  assert.equal(home.games, 2);
  assert.equal(home.line.pts, 20);
  assert.equal(away.games, 1);
  assert.equal(away.line.pts, 20);
  assert.equal(home.games + away.games, 3);

  // Milestones follow the regular season only: no 100th game, and the first game is r1, not the preseason game.
  assert.equal(s.regular.milestones.some((m) => m.label === "100th game"), false);
  const first = s.regular.milestones.find((m) => m.label === "First game on record");
  assert.equal(first?.game?.game_espn_id, "r1");
  assert.equal(s.regular.firstDate, "2026-01-10");
  assert.equal(s.regular.lastDate, "2026-02-01");
});

test("NBA player with no playoffs and no play-in gets null tables", () => {
  const s = buildStagedProfile("nba", NBA_ROWS.filter((r) => r.stage === "regular" || r.stage === "excluded"));
  assert.equal(s.regular.games, 3);
  assert.equal(s.playoffs, null);
  assert.equal(s.playin, null);
  assert.equal(s.counted.games, 3);
});

test("NBA: playoff rows that are all DNPs do not make a playoffs table", () => {
  const s = buildStagedProfile("nba", [
    row({ id: "r1", date: "2026-01-10", stage: "regular", stats: nba(10) }),
    row({ id: "p1", date: "2026-04-20", stage: "playoffs", stats: nbaDnp }),
  ]);
  assert.equal(s.playoffs, null);
});

const nfl = (stats: Stats): Stats => stats;
const passing = (yds: number): Stats => nfl({ passing: { "C/ATT": "20/30", YDS: String(yds), TD: "2", INT: "0", RTG: "100.0" } });
const rushing = (yds: number): Stats => nfl({ rushing: { CAR: "5", YDS: String(yds), TD: "0", AVG: "4.0" } });

test("NFL: preseason is excluded from the regular season and every table has the same columns", () => {
  const rows = [
    row({ id: "pre", date: "2025-08-15", season_year: 2025, stage: "excluded", season_type: 1, stats: passing(500) }),
    row({ id: "w1", date: "2025-09-07", season_year: 2025, stage: "regular", season_type: 2, stats: passing(200) }),
    row({ id: "w2", date: "2025-09-14", season_year: 2025, stage: "regular", season_type: 2, stats: passing(300) }),
    // A playoff game in which he only ran the ball: alone it would get rushing columns.
    row({ id: "po", date: "2026-01-12", season_year: 2025, stage: "playoffs", season_type: 3, stats: rushing(40) }),
  ];
  const s = buildStagedProfile("nfl", rows);
  assert.equal(s.split, true);
  assert.equal(s.regular.games, 2);
  assert.equal(s.regular.career.pass_yds, 500);
  assert.equal(s.regular.seasons[0].games, 2);
  assert.ok(s.playoffs);
  assert.equal(s.playoffs.games, 1);
  // The regular season's columns apply, so the passing columns are empty for that game.
  assert.equal(s.playoffs.career.pass_yds, null);
  assert.equal("rush_yds" in s.playoffs.career, false);
  assert.equal(s.playin, null);
  assert.equal(s.counted.games, 3);
  assert.equal(s.log.length, 4);

  const keys = (specs: { key: string }[]) => specs.map((sp) => sp.key);
  assert.deepEqual(keys(s.playoffs.profile.specs), keys(s.regular.profile.specs));
  assert.deepEqual(keys(s.counted.profile.specs), keys(s.regular.profile.specs));
  assert.ok(keys(s.regular.profile.specs).includes("pass_yds"));
  assert.equal(keys(s.regular.profile.specs).includes("rush_yds"), false);
});

const soccer = (g: number): Stats => ({ match: { APP: "1", SUBIN: "0", G: String(g), A: "0", SHOT: "2", SOG: "1" } });

test("soccer keeps one table: a Champions League knockout ('other') counts as an appearance", () => {
  const rows = [
    row({ id: "s1", date: "2026-01-10", stage: "regular", stats: soccer(1) }),
    row({ id: "s2", date: "2026-01-17", stage: "regular", stats: soccer(0) }),
    row({ id: "cl", date: "2026-02-20", stage: "other", stats: soccer(2) }),
  ];
  const s = buildStagedProfile("soccer", rows);
  assert.equal(s.split, false);
  assert.equal(s.regular.games, 3);
  assert.equal(s.regular.career.g, 3);
  assert.equal(s.playoffs, null);
  assert.equal(s.playin, null);
  assert.equal(s.counted.games, 3);
  assert.equal(s.log.length, 3);
  assert.equal(s.log[0].game_espn_id, "cl");
});

test("buildProfile without a third argument behaves as before", () => {
  const regularRows = NBA_ROWS.filter((r) => r.stage === "regular");
  const plain = buildProfile("nba", regularRows);
  const staged = buildStagedProfile("nba", regularRows).regular;
  assert.equal(plain.games, 3);
  assert.deepEqual(plain.career, staged.career);
  assert.deepEqual(plain.milestones, staged.milestones);

  const passRows = [
    row({ id: "a", date: "2025-09-07", stage: "regular", stats: passing(200) }),
    row({ id: "b", date: "2025-09-14", stage: "regular", stats: passing(300) }),
  ];
  const own = buildProfile("nfl", passRows);
  const explicit = buildProfile("nfl", passRows, passRows);
  assert.deepEqual(own.profile.specs.map((sp) => sp.key), explicit.profile.specs.map((sp) => sp.key));
  assert.equal(own.career.pass_yds, 500);
  assert.equal(explicit.career.pass_yds, 500);
});

test("buildProfile takes the NFL columns from the spec rows, not the rows it aggregates", () => {
  const passRows = [row({ id: "a", date: "2025-09-07", stage: "regular", stats: passing(200) })];
  const runRows = [row({ id: "b", date: "2026-01-12", stage: "playoffs", stats: rushing(40) })];
  const p = buildProfile("nfl", runRows, passRows);
  assert.equal(p.games, 1);
  assert.equal(p.profile.specs.some((sp) => sp.key === "pass_yds"), true);
  assert.equal(p.profile.specs.some((sp) => sp.key === "rush_yds"), false);
});

// ---------------------------------------------------------------------------
// NFL games played: ESPN's figure for the regular season, the log's count everywhere else.
// ---------------------------------------------------------------------------
const nflGame = (id: string, date: string, season: number, stage: GameStage = "regular", result: "W" | "L" = "W"): PlayerLogRow => ({
  ...row({ id, date, season_year: season, stage, season_type: stage === "playoffs" ? 3 : 2, stats: passing(200) }),
  result,
});

// 2025: two logged games (a win and a loss); 2024: three logged games (all wins).
const NFL_TWO_SEASONS: PlayerLogRow[] = [
  nflGame("a1", "2025-09-07", 2025, "regular", "W"),
  nflGame("a2", "2025-09-14", 2025, "regular", "L"),
  nflGame("b1", "2024-09-08", 2024),
  nflGame("b2", "2024-09-15", 2024),
  nflGame("b3", "2024-09-22", 2024),
];

test("NFL: ESPN's games played replaces the logged count, and a W-L that would contradict it is dropped", () => {
  const s = buildStagedProfile("nfl", [nflGame("a1", "2025-09-07", 2025, "regular", "L")], new Map([[2025, 16]]));
  const season = s.regular.seasons[0];
  assert.equal(season.games, 16);
  assert.equal(season.gamesSource, "espn");
  assert.equal(season.record, null);
  assert.equal(s.regular.games, 16);
  assert.equal(s.regular.record, null);
  assert.equal(s.regular.gamesFromEspn, true);
  // Totals and the log stay what the box scores say.
  assert.equal(s.regular.career.pass_yds, 200);
  assert.equal(s.regular.rows.length, 1);
  assert.equal(s.log.length, 1);
});

test("NFL: an ESPN figure at or below the logged count never shows fewer games than the log, and the W-L stays", () => {
  const equal = buildStagedProfile("nfl", NFL_TWO_SEASONS.slice(0, 2), new Map([[2025, 2]])).regular;
  assert.equal(equal.seasons[0].games, 2);
  assert.equal(equal.seasons[0].gamesSource, "espn");
  assert.deepEqual(equal.seasons[0].record, { w: 1, d: 0, l: 1 });
  assert.deepEqual(equal.record, { w: 1, d: 0, l: 1 });

  const stale = buildStagedProfile("nfl", NFL_TWO_SEASONS.slice(0, 2), new Map([[2025, 1]])).regular;
  assert.equal(stale.seasons[0].games, 2);
  assert.equal(stale.seasons[0].gamesSource, "espn");
  assert.deepEqual(stale.seasons[0].record, { w: 1, d: 0, l: 1 });
  assert.equal(stale.games, 2);
});

test("NFL: a season the map has no figure for shows the logged count, with its W-L", () => {
  const p = buildStagedProfile("nfl", NFL_TWO_SEASONS, new Map([[2024, 17]])).regular;
  const s2025 = p.seasons.find((x) => x.season === 2025)!;
  assert.equal(s2025.games, 2);
  assert.equal(s2025.gamesSource, "logged");
  assert.deepEqual(s2025.record, { w: 1, d: 0, l: 1 });
});

test("NFL: two seasons, one from ESPN and one logged; the career adds the displayed games and loses its W-L", () => {
  const p = buildStagedProfile("nfl", NFL_TWO_SEASONS, new Map([[2024, 17]])).regular;
  const s2024 = p.seasons.find((x) => x.season === 2024)!;
  assert.equal(s2024.games, 17);
  assert.equal(s2024.gamesSource, "espn");
  assert.equal(s2024.record, null);
  assert.equal(p.games, 19);
  assert.equal(p.record, null);
  assert.equal(p.gamesFromEspn, true);
});

test("NFL: with every ESPN figure at or below the log, the career W-L is the logged one", () => {
  const p = buildStagedProfile("nfl", NFL_TWO_SEASONS, new Map([[2024, 3], [2025, 2]])).regular;
  assert.equal(p.games, 5);
  assert.deepEqual(p.record, { w: 4, d: 0, l: 1 });
});

test("NFL: only seasons with logged rows are listed, even when the map has more", () => {
  const p = buildStagedProfile("nfl", NFL_TWO_SEASONS.slice(0, 2), new Map([[2025, 16], [2023, 17]])).regular;
  assert.deepEqual(p.seasons.map((x) => x.season), [2025]);
  assert.equal(p.games, 16);
});

test("NFL: a profile built without a map, or with a map that has none of its seasons, is logged", () => {
  const plain = buildStagedProfile("nfl", NFL_TWO_SEASONS).regular;
  assert.equal(plain.games, 5);
  assert.deepEqual(plain.record, { w: 4, d: 0, l: 1 });
  assert.equal(plain.gamesFromEspn, false);
  assert.deepEqual(plain.seasons.map((x) => x.gamesSource), ["logged", "logged"]);

  const unmatched = buildStagedProfile("nfl", NFL_TWO_SEASONS, new Map([[2019, 17]])).regular;
  assert.equal(unmatched.games, 5);
  assert.deepEqual(unmatched.record, { w: 4, d: 0, l: 1 });
  assert.equal(unmatched.gamesFromEspn, false);
});

test("NBA and soccer ignore a map that is passed to them", () => {
  const map = new Map([[2026, 82]]);
  const nbaRows = NBA_ROWS.filter((r) => r.stage === "regular");
  const n = buildStagedProfile("nba", nbaRows, map).regular;
  assert.equal(n.games, 3);
  assert.equal(n.seasons[0].games, 3);
  assert.equal(n.seasons[0].gamesSource, "logged");
  assert.deepEqual(n.record, { w: 3, d: 0, l: 0 });
  assert.equal(n.gamesFromEspn, false);
  assert.equal(buildProfile("nba", nbaRows, nbaRows, map).games, 3);

  const soccerRows = [row({ id: "s1", date: "2026-01-10", stage: "regular", stats: soccer(1) }), row({ id: "s2", date: "2026-01-17", stage: "regular", stats: soccer(0) })];
  const sc = buildStagedProfile("soccer", soccerRows, map).regular;
  assert.equal(sc.games, 2);
  assert.equal(sc.seasons[0].gamesSource, "logged");
  assert.deepEqual(sc.record, { w: 2, d: 0, l: 0 });
  assert.equal(sc.gamesFromEspn, false);
  assert.equal(buildProfile("soccer", soccerRows, soccerRows, map).games, 2);
});

test("NFL: the playoffs and counted profiles ignore the map", () => {
  const rows = [nflGame("a1", "2025-09-07", 2025), nflGame("a2", "2025-09-14", 2025), nflGame("po", "2026-01-12", 2025, "playoffs")];
  const s = buildStagedProfile("nfl", rows, new Map([[2025, 17]]));
  assert.equal(s.regular.games, 17);
  assert.ok(s.playoffs);
  assert.equal(s.playoffs.games, 1);
  assert.equal(s.playoffs.seasons[0].games, 1);
  assert.equal(s.playoffs.seasons[0].gamesSource, "logged");
  assert.deepEqual(s.playoffs.record, { w: 1, d: 0, l: 0 });
  assert.equal(s.playoffs.gamesFromEspn, false);
  assert.equal(s.counted.games, 3);
  assert.equal(s.counted.gamesFromEspn, false);
});

test("NFL: home/away, result and opponent splits, best games and recent form stay logged", () => {
  const p = buildStagedProfile("nfl", NFL_TWO_SEASONS, new Map([[2024, 17], [2025, 16]])).regular;
  assert.equal(p.games, 33);
  assert.equal(p.homeAway.reduce((n, x) => n + x.games, 0), 5);
  assert.equal(p.byResult.reduce((n, x) => n + x.games, 0), 5);
  assert.equal(p.opponents.reduce((n, x) => n + x.games, 0), 5);
  assert.deepEqual(p.byResult.map((x) => [x.key, x.games]), [["w", 4], ["l", 1]]);
  assert.deepEqual(p.homeAway[0].record, { w: 4, d: 0, l: 1 });
  assert.equal(p.best.length, 5);
  assert.equal(p.form.length, 5);
});

test("recordText shows a dash for a record that was dropped", () => {
  assert.equal(recordText(null, false), "–");
  assert.equal(recordText(null, true), "–");
  assert.equal(recordText({ w: 3, d: 1, l: 2 }, true), "3-1-2");
  assert.equal(recordText({ w: 3, d: 0, l: 2 }, false), "3-2");
});

test("career strip: ESPN's games as GP and a dash for the W-L when the season is short of a full log", () => {
  const strip = careerStripStats(buildStagedProfile("nfl", NFL_TWO_SEASONS, new Map([[2024, 17], [2025, 16]])).regular);
  assert.deepEqual(strip.slice(0, 2), [
    { label: "GP", value: "33" },
    { label: "W-L", value: "–" },
  ]);
});

test("career strip: an NFL profile whose games are the log's is labelled Logged, and keeps its W-L", () => {
  const strip = careerStripStats(buildStagedProfile("nfl", NFL_TWO_SEASONS).regular);
  assert.deepEqual(strip.slice(0, 2), [
    { label: "Logged", value: "5", title: "Games with a recorded stat line" },
    { label: "W-L", value: "4-1" },
  ]);
  // NBA is untouched.
  const nbaStrip = careerStripStats(buildStagedProfile("nba", NBA_ROWS.filter((r) => r.stage === "regular")).regular);
  assert.equal(nbaStrip[0].label, "GP");
  assert.equal(nbaStrip[0].value, "3");
});
