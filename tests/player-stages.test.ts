import { test } from "node:test";
import assert from "node:assert/strict";
import { buildProfile, buildStagedProfile, noBoxScoreGames, ReportedGames, unlistedGameCount, type PlayerLogRow, type Stats } from "../src/lib/playerProfile";
import { noBoxScoreGamesTitle } from "../src/lib/playerCopy";
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
  no_box_score?: boolean;
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
    ...(o.no_box_score === undefined ? {} : { no_box_score: o.no_box_score }),
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

test("NFL: a logged row with no season year still counts in the career games, as it does in the career W-L", () => {
  const noYear: PlayerLogRow = { ...nflGame("n1", "2025-09-21", 2025), season_year: null };
  const s = buildStagedProfile("nfl", [nflGame("a1", "2025-09-07", 2025), noYear], new Map([[2025, 1]]));
  assert.equal(s.regular.seasons.length, 1);
  assert.equal(s.regular.seasons[0].games, 1);
  assert.equal(s.regular.games, 2);
  assert.equal(s.regular.rows.length, 2);
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

test("NFL: a season the map has a figure for but the log has no rows for is listed with ESPN's games (see nfl-zero-stat-seasons.test.ts)", () => {
  const rows = NFL_TWO_SEASONS.slice(0, 2);
  assert.ok(rows.every((r) => r.stage !== "playoffs"));
  // Stat-free stored row, or one with a stat and no playoffs row that season: listed.
  for (const map of [new ReportedGames([[2025, 16], [2023, 17]], [2023]), new ReportedGames([[2025, 16], [2023, 17]], [])]) {
    const listed = buildStagedProfile("nfl", rows, map).regular;
    assert.deepEqual(listed.seasons.map((x) => [x.season, x.games, x.recorded]), [[2025, 16, 2], [2023, 17, 0]]);
    assert.equal(listed.games, 33);
  }
  // A plain map has no stat-free information: the season is not listed.
  const plain = buildStagedProfile("nfl", rows, new Map([[2025, 16], [2023, 17]])).regular;
  assert.deepEqual(plain.seasons.map((x) => x.season), [2025]);
  assert.equal(plain.games, 16);
});

test("NFL: a profile built without a map is logged; a map with only a season of no rows leaves the logged seasons as they were", () => {
  const plain = buildStagedProfile("nfl", NFL_TWO_SEASONS).regular;
  assert.equal(plain.games, 5);
  assert.deepEqual(plain.record, { w: 4, d: 0, l: 1 });
  assert.equal(plain.gamesFromEspn, false);
  assert.deepEqual(plain.seasons.map((x) => x.gamesSource), ["logged", "logged"]);

  const unmatched = buildStagedProfile("nfl", NFL_TWO_SEASONS, new ReportedGames([[2019, 17]], [2019])).regular;
  assert.deepEqual(unmatched.seasons.filter((x) => x.recorded > 0), plain.seasons);
  assert.deepEqual(unmatched.seasons.map((x) => [x.season, x.games, x.gamesSource]), [[2025, 2, "logged"], [2024, 3, "logged"], [2019, 17, "espn"]]);
  assert.equal(unmatched.games, 22);
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

// ---------------------------------------------------------------------------
// NBA games ESPN published no box score for: the player is listed with MIN "--" and zeros. Those rows are games
// played (counted, never averaged), and ESPN's stored season games played wins over the listed count.
// ---------------------------------------------------------------------------
const nbaBlank: Stats = { box: { MIN: "--", PTS: "0", REB: "0", AST: "0" } };
const played = (id: string, date: string, pts: number, o: Partial<RowOptions> = {}): PlayerLogRow => row({ id, date, stage: "regular", season_type: 2, stats: nba(pts), ...o });
const blank = (id: string, date: string, o: Partial<RowOptions> = {}): PlayerLogRow => row({ id, date, stage: "regular", season_type: 2, stats: nbaBlank, no_box_score: true, ...o });

// Three games with a box score (10, 20, 30 points) and two without, one regular season.
const MIXED: PlayerLogRow[] = [
  played("a1", "2026-01-10", 10),
  played("a2", "2026-01-20", 20),
  blank("u1", "2026-01-25"),
  played("a3", "2026-02-01", 30),
  blank("u2", "2026-02-05"),
];

test("NBA: games with no box score count as games played, listed, and stay out of the rows and the averages", () => {
  const p = buildProfile("nba", MIXED);
  const season = p.seasons[0];
  assert.equal(season.games, 5);
  assert.equal(season.gamesSource, "listed");
  assert.equal(season.unrecorded, 2);
  assert.equal(season.record, null);
  assert.equal(season.line.pts, 20);
  assert.equal(p.games, 5);
  assert.equal(p.unrecorded, 2);
  assert.equal(p.record, null);
  assert.equal(p.gamesFromEspn, false);
  assert.equal(p.rows.length, 3);
  assert.equal(p.career.pts, 20);
  assert.deepEqual(p.homeAway.map((s) => s.games), [3, 0]);
  assert.deepEqual(p.form.map((f) => f.row.game_espn_id), ["a1", "a2", "a3"]);
  assert.deepEqual(p.best.map((r) => r.game_espn_id), ["a3", "a2", "a1"]);
  assert.equal(p.lastDate, "2026-02-01");
});

test("NBA: ESPN's stored games played replaces the listed count, and a stale figure never goes below the logged games", () => {
  const withFigure = (n: number) => buildStagedProfile("nba", MIXED, new Map([[2026, n]])).regular;
  const six = withFigure(6);
  assert.equal(six.seasons[0].games, 6);
  assert.equal(six.seasons[0].gamesSource, "espn");
  assert.equal(six.seasons[0].unrecorded, 2);
  assert.equal(six.seasons[0].record, null);
  assert.equal(six.games, 6);
  assert.equal(six.gamesFromEspn, true);
  assert.equal(six.unrecorded, 2);
  // ESPN wins over the listed five, in either direction.
  assert.equal(withFigure(4).games, 4);
  assert.equal(withFigure(4).seasons[0].gamesSource, "espn");
  // Below the three games with a stat line: the logged games.
  assert.equal(withFigure(2).games, 3);
  assert.equal(withFigure(2).seasons[0].games, 3);
});

test("NBA: a season whose every game has no box score is still a season, with no figures", () => {
  const rows = ["u1", "u2", "u3", "u4"].map((id, i) => blank(id, `2026-02-0${i + 1}`));
  const p = buildProfile("nba", rows, rows, new Map([[2026, 4]]));
  assert.equal(p.seasons.length, 1);
  const season = p.seasons[0];
  assert.equal(season.season, 2026);
  assert.equal(season.games, 4);
  assert.equal(season.gamesSource, "espn");
  assert.equal(season.unrecorded, 4);
  assert.equal(season.record, null);
  assert.ok(Object.keys(season.line).length > 0);
  assert.ok(Object.values(season.line).every((v) => v === null));
  assert.deepEqual(season.teams.map((t) => t.espn_id), ["1"]);
  assert.equal(p.rows.length, 0);
  assert.equal(p.games, 4);
  assert.equal(p.unrecorded, 4);
  assert.equal(p.record, null);
  assert.ok(Object.values(p.career).every((v) => v === null));
  // The one landmark such a career has is its first game, on a game with no box score.
  assert.deepEqual(p.milestones.map((m) => [m.label, m.game?.game_espn_id]), [["First game on record", "u1"]]);

  // Without a figure the listed count stands.
  const listed = buildProfile("nba", rows).seasons[0];
  assert.equal(listed.games, 4);
  assert.equal(listed.gamesSource, "listed");
});

test("NBA: a season's teams include the teams of its games with no box score", () => {
  const rows = [played("a1", "2026-01-10", 10), blank("u1", "2026-02-01", {})];
  rows[1] = { ...rows[1], team_espn_id: "9", team_name: "Other FC", team_slug: "other-fc" };
  const p = buildProfile("nba", rows);
  assert.deepEqual(p.seasons[0].teams.map((t) => t.espn_id), ["1", "9"]);
});

test("NBA: an ordinary season ignores ESPN's figure, and only the season with unrecorded games uses it", () => {
  const ordinary = [played("a1", "2026-01-10", 10), played("a2", "2026-01-20", 20), played("a3", "2026-02-01", 30)];
  const p = buildProfile("nba", ordinary, ordinary, new Map([[2026, 82]]));
  assert.equal(p.seasons[0].games, 3);
  assert.equal(p.seasons[0].gamesSource, "logged");
  assert.equal(p.seasons[0].unrecorded, 0);
  assert.deepEqual(p.seasons[0].record, { w: 3, d: 0, l: 0 });
  assert.equal(p.games, 3);
  assert.equal(p.unrecorded, 0);
  assert.equal(p.gamesFromEspn, false);

  // 2026 has no unrecorded rows, so its figure is ignored; 2025 has one, so its figure is used.
  const two = [
    ...ordinary,
    played("b1", "2025-01-10", 10, { season_year: 2025 }),
    blank("bu", "2025-01-12", { season_year: 2025 }),
  ];
  const t = buildProfile("nba", two, two, new Map([[2026, 82], [2025, 70]]));
  assert.deepEqual(t.seasons.map((s) => [s.season, s.games, s.gamesSource, s.unrecorded]), [[2026, 3, "logged", 0], [2025, 70, "espn", 1]]);
  assert.equal(t.games, 73);
  assert.equal(t.unrecorded, 1);
  assert.equal(t.gamesFromEspn, true);
});

test("NBA: a flagged row that still has a minutes line is an ordinary game played", () => {
  const flagged = played("a1", "2026-01-10", 0, { stats: { box: { MIN: "12", PTS: "0", REB: "0", AST: "0" } }, no_box_score: true });
  const p = buildProfile("nba", [flagged, played("a2", "2026-01-20", 20)]);
  assert.equal(p.rows.length, 2);
  assert.equal(p.games, 2);
  assert.equal(p.unrecorded, 0);
  assert.equal(p.seasons[0].unrecorded, 0);
  assert.equal(p.seasons[0].gamesSource, "logged");
  assert.deepEqual(p.seasons[0].record, { w: 2, d: 0, l: 0 });
});

test("NBA: career games and unrecorded add up across seasons, and a row with no season year still counts", () => {
  const rows = [
    played("a1", "2026-01-10", 10),
    played("a2", "2026-01-20", 20),
    played("n1", "2026-01-30", 30, { season_year: null }),
    played("b1", "2025-01-10", 10, { season_year: 2025 }),
    blank("bu1", "2025-01-12", { season_year: 2025 }),
    blank("bu2", "2025-01-14", { season_year: 2025 }),
    blank("bu3", "2025-01-16", { season_year: 2025 }),
  ];
  const p = buildProfile("nba", rows);
  assert.deepEqual(p.seasons.map((s) => [s.season, s.games, s.gamesSource, s.unrecorded]), [[2026, 2, "logged", 0], [2025, 4, "listed", 3]]);
  assert.equal(p.games, 2 + 4 + 1);
  assert.equal(p.unrecorded, 3);
  assert.equal(p.rows.length, 4);
  assert.equal(p.record, null);

  // A game with no box score and no season year is a game too.
  const noYear = buildProfile("nba", [played("a1", "2026-01-10", 10), blank("un", "2026-01-12", { season_year: null })]);
  assert.equal(noYear.games, 2);
  assert.equal(noYear.unrecorded, 1);
  // Its result is unknown, so the W-L is dropped even though no season line lost its own.
  assert.equal(noYear.record, null);
  assert.equal(buildProfile("nba", [blank("un", "2026-01-12", { season_year: null })]).record, null);
});

test("NBA staged: a playoff run of games with no box score is a listed playoffs table; the log leaves them out", () => {
  const rows = [
    played("r1", "2026-01-10", 10),
    blank("pu1", "2026-04-20", { stage: "playoffs", season_type: 3 }),
    blank("pu2", "2026-04-22", { stage: "playoffs", season_type: 3 }),
    blank("pu3", "2026-04-24", { stage: "playoffs", season_type: 3 }),
  ];
  // ESPN's stored figure is regular season only, so the playoffs are listed even when a figure is supplied.
  const s = buildStagedProfile("nba", rows, new Map([[2026, 82]]));
  assert.ok(s.playoffs);
  assert.equal(s.playoffs.games, 3);
  assert.equal(s.playoffs.unrecorded, 3);
  assert.equal(s.playoffs.seasons[0].gamesSource, "listed");
  assert.equal(s.playoffs.rows.length, 0);
  assert.equal(s.playin, null);
  // The regular season has no unrecorded rows, so its figure is ignored.
  assert.equal(s.regular.games, 1);
  assert.equal(s.regular.seasons[0].gamesSource, "logged");
  assert.deepEqual(s.log.map((r) => r.game_espn_id), ["r1"]);
});

test("NBA staged: a regular season with unrecorded games takes ESPN's figure, and an all-unrecorded play-in makes a table", () => {
  const rows = [
    played("r1", "2026-01-10", 10),
    blank("ru1", "2026-01-12"),
    blank("piu", "2026-04-15", { stage: "playin", season_type: 5 }),
  ];
  const s = buildStagedProfile("nba", rows, new Map([[2026, 60]]));
  assert.equal(s.regular.games, 60);
  assert.equal(s.regular.gamesFromEspn, true);
  assert.ok(s.playin);
  assert.equal(s.playin.games, 1);
  assert.equal(s.playin.seasons[0].gamesSource, "listed");
  assert.equal(s.playoffs, null);
  assert.deepEqual(s.log.map((r) => r.game_espn_id), ["r1"]);
});

// Chronological games: 49 with a box score, then one without (the 50th), then `after` more with one.
function careerRows(after: number, unrecordedAt: number | null): PlayerLogRow[] {
  const rows: PlayerLogRow[] = [];
  const total = 49 + 1 + after;
  for (let i = 1; i <= total; i += 1) {
    const date = new Date(Date.UTC(2020, 0, i)).toISOString().slice(0, 10);
    rows.push(i === unrecordedAt ? blank(`g${i}`, date) : played(`g${i}`, date, 10));
  }
  return rows;
}

test("NBA milestones: an Nth game that has no box score is skipped, and later ordinals count it as a game", () => {
  const p = buildProfile("nba", careerRows(55, 50));
  const labels = p.milestones.map((m) => m.label);
  assert.equal(labels.includes("50th game"), false);
  const hundredth = p.milestones.find((m) => m.label === "100th game");
  assert.equal(hundredth?.game?.game_espn_id, "g100");
  assert.equal(p.games, 105);
  assert.equal(p.milestones.find((m) => m.label === "First game on record")?.game?.game_espn_id, "g1");
});

test("NBA milestones: without unrecorded games the ordinals are unchanged", () => {
  const p = buildProfile("nba", careerRows(55, null));
  assert.equal(p.milestones.find((m) => m.label === "50th game")?.game?.game_espn_id, "g50");
  assert.equal(p.milestones.find((m) => m.label === "100th game")?.game?.game_espn_id, "g100");
  assert.equal(p.unrecorded, 0);
});

test("NBA milestones: an earlier game with no box score counts toward the 50th game", () => {
  // g5 is a 30-point game; the third game has no box score.
  const rows = careerRows(10, 3).map((r) => (r.game_espn_id === "g5" ? played("g5", r.date, 30) : r));
  const p = buildProfile("nba", rows);
  // 60 games listed, the third without a box score: the 50th game is g50 (played rows alone would give g51).
  assert.equal(p.milestones.find((m) => m.label === "50th game")?.game?.game_espn_id, "g50");
  assert.equal(p.rows.length, 59);
  // The 30-point game and the like still read the played rows only, so they never point at the row with no box score.
  assert.equal(p.milestones.find((m) => m.label === "30-point game")?.game?.game_espn_id, "g5");
});

test("NBA milestones: the first game on record is that game even when it has no box score", () => {
  const rows = [blank("u0", "2019-12-30"), played("a1", "2020-01-05", 35)];
  const p = buildProfile("nba", rows);
  const first = p.milestones.find((m) => m.label === "First game on record");
  assert.equal(first?.game?.game_espn_id, "u0");
  assert.equal(first?.game?.no_box_score, true);
  assert.equal(p.milestones.find((m) => m.label === "30-point game")?.game?.game_espn_id, "a1");
  // firstDate and the rest of the played-row facts still start at the first game with a stat line.
  assert.equal(p.firstDate, "2020-01-05");
});

// ---------------------------------------------------------------------------
// `recorded`: the games with a stat line. GP minus it is the games with no box score, never negative.
// ---------------------------------------------------------------------------
test("recorded: an ordinary season and career equal their games", () => {
  const p = buildProfile("nba", NBA_ROWS.filter((r) => r.stage === "regular"));
  assert.equal(p.seasons[0].recorded, 3);
  assert.equal(p.seasons[0].games, 3);
  assert.equal(p.recorded, 3);
  assert.equal(p.games - p.recorded, 0);
});

test("recorded: a season with unrecorded rows and ESPN's figure counts only its stat lines", () => {
  const p = buildStagedProfile("nba", MIXED, new Map([[2026, 6]])).regular;
  assert.equal(p.seasons[0].games, 6);
  assert.equal(p.seasons[0].recorded, 3);
  assert.equal(p.recorded, 3);
  assert.equal(p.games - p.recorded, 3);
  // Without a figure the games are the listed ones.
  const listed = buildProfile("nba", MIXED);
  assert.equal(listed.seasons[0].recorded, 3);
  assert.equal(listed.games - listed.recorded, 2);
});

test("recorded: a stale ESPN figure below the logged games leaves no games with no box score", () => {
  const p = buildStagedProfile("nba", MIXED, new Map([[2026, 2]])).regular;
  assert.equal(p.seasons[0].games, 3);
  assert.equal(p.seasons[0].recorded, 3);
  assert.equal(p.games - p.recorded, 0);
});

test("recorded: a season whose every game has no box score records none", () => {
  const rows = ["u1", "u2", "u3"].map((id, i) => blank(id, `2026-02-0${i + 1}`));
  const p = buildProfile("nba", rows);
  assert.equal(p.seasons[0].games, 3);
  assert.equal(p.seasons[0].recorded, 0);
  assert.equal(p.games, 3);
  assert.equal(p.recorded, 0);
  assert.equal(p.games - p.recorded, 3);
});

test("recorded: the career adds every season's stat lines and the played rows with no season year", () => {
  const rows = [
    played("a1", "2026-01-10", 10),
    played("a2", "2026-01-20", 20),
    played("n1", "2026-01-30", 30, { season_year: null }),
    blank("nu", "2026-01-31", { season_year: null }),
    played("b1", "2025-01-10", 10, { season_year: 2025 }),
    blank("bu1", "2025-01-12", { season_year: 2025 }),
  ];
  const p = buildProfile("nba", rows, rows, new Map([[2025, 70]]));
  assert.deepEqual(p.seasons.map((s) => [s.season, s.games, s.recorded]), [[2026, 2, 2], [2025, 70, 1]]);
  // 2 + 1 across the seasons, plus the played row with no season year; the unrecorded one with no year is not a stat line.
  assert.equal(p.recorded, 4);
  assert.equal(p.recorded, p.seasons.reduce((n, s) => n + s.recorded, 0) + 1);
  assert.equal(p.games, 2 + 70 + 2);
  assert.equal(p.games - p.recorded, 70);
});

test("recorded: the NFL's ESPN figure above the log does not read as games with no box score", () => {
  const p = buildStagedProfile("nfl", NFL_TWO_SEASONS, new Map([[2024, 17], [2025, 16]])).regular;
  assert.equal(p.recorded, 5);
  assert.equal(p.games, 33);
  assert.equal(noBoxScoreGames(p.sport, p.games, p.recorded), 0);
  assert.equal(noBoxScoreGames("soccer", 4, 2), 0);
  assert.equal(noBoxScoreGames("nba", 5, 3), 2);
  assert.equal(noBoxScoreGames("nba", 3, 3), 0);
  assert.equal(noBoxScoreGames("nba", 2, 3), 0);
});

test("unlistedGameCount: the games behind the daggers, games minus recorded, summed over the regular season, playoffs and play-in", () => {
  // Listed only: the rows without a box score are the count (2).
  assert.equal(unlistedGameCount(buildStagedProfile("nba", MIXED)), 2);
  // ESPN's stored figure (6) counts three games with no box score, where the rows list two: the count is the dagger's.
  const staged = buildStagedProfile("nba", MIXED, new Map([[2026, 6]]));
  assert.equal(staged.counted.unrecorded, 2);
  assert.equal(unlistedGameCount(staged), staged.regular.games - staged.regular.recorded);
  assert.equal(unlistedGameCount(staged), 3);
  // Playoffs and play-in add their own games minus recorded.
  const rows = [
    ...MIXED,
    played("p1", "2026-04-20", 12, { stage: "playoffs", season_type: 3 }),
    blank("pu1", "2026-04-22", { stage: "playoffs", season_type: 3 }),
    blank("piu", "2026-04-15", { stage: "playin", season_type: 5 }),
  ];
  const all = buildStagedProfile("nba", rows, new Map([[2026, 6]]));
  assert.equal(unlistedGameCount(all), 3 + 1 + 1);
  // A stale figure below the logged games leaves no games without a box score, as the dagger says.
  assert.equal(unlistedGameCount(buildStagedProfile("nba", MIXED, new Map([[2026, 2]]))), 0);
  // Nothing missing, and the other sports: none.
  assert.equal(unlistedGameCount(buildStagedProfile("nba", NBA_ROWS)), 0);
  assert.equal(unlistedGameCount(buildStagedProfile("nfl", NFL_TWO_SEASONS, new Map([[2024, 17], [2025, 16]]))), 0);
  assert.equal(unlistedGameCount(buildStagedProfile("soccer", NBA_ROWS)), 0);
});

test("profile teams include a team the player only has games with no box score for", () => {
  const rows = [played("a1", "2026-01-10", 10), blank("u1", "2026-02-01")];
  rows[1] = { ...rows[1], team_espn_id: "9", team_name: "Other FC", team_slug: "other-fc" };
  const p = buildProfile("nba", rows);
  assert.deepEqual(p.teams.map((t) => t.espn_id), ["9", "1"]);
  assert.deepEqual(p.seasons[0].teams.map((t) => t.espn_id), ["1", "9"]);
  // The staged profiles read every counted game too.
  assert.deepEqual(buildStagedProfile("nba", rows).counted.teams.map((t) => t.espn_id), ["9", "1"]);
  // A profile with nothing but games with no box score still names its team.
  assert.deepEqual(buildProfile("nba", [rows[1]]).teams.map((t) => t.espn_id), ["9"]);
});

// ---------------------------------------------------------------------------
// The career strip's GP: a dagger and a tooltip when it includes games with no box score, the NBA only.
// ---------------------------------------------------------------------------
test("career strip: NBA GP carries a dagger and the tooltip when games have no box score", () => {
  const listed = careerStripStats(buildProfile("nba", MIXED));
  assert.deepEqual(listed[0], { label: "GP", value: "5†", title: noBoxScoreGamesTitle(2, "listed"), noBoxScore: true });
  const espn = careerStripStats(buildStagedProfile("nba", MIXED, new Map([[2026, 6]])).regular);
  assert.deepEqual(espn[0], { label: "GP", value: "6†", title: noBoxScoreGamesTitle(3, "espn"), noBoxScore: true });
  // A stale figure below the logged games leaves nothing to mark.
  assert.deepEqual(careerStripStats(buildStagedProfile("nba", MIXED, new Map([[2026, 2]])).regular)[0], { label: "GP", value: "3" });
  // Every game without a box score: the games are all there is, the averages are dashes.
  const only = careerStripStats(buildProfile("nba", [blank("u1", "2026-02-01"), blank("u2", "2026-02-02")]));
  assert.equal(only[0].value, "2†");
  // Only the GP stat is marked; the flag is absent (not false) everywhere else, so other strips keep their shape.
  assert.deepEqual(only.map((s) => "noBoxScore" in s), [true, ...only.slice(1).map(() => false)]);
  assert.equal(only[1].value, "–");
  assert.ok(only.slice(2).every((s) => s.value === "–"));
});

test("career strip: an NFL profile with ESPN's figure above its log gets no dagger", () => {
  const strip = careerStripStats(buildStagedProfile("nfl", NFL_TWO_SEASONS, new Map([[2024, 17], [2025, 16]])).regular);
  assert.deepEqual(strip[0], { label: "GP", value: "33" });
});
