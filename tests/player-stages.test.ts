import { test } from "node:test";
import assert from "node:assert/strict";
import { buildProfile, buildStagedProfile, type PlayerLogRow, type Stats } from "../src/lib/playerProfile";
import type { GameStage } from "../src/lib/gameStage";

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
