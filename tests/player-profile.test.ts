// How a box-score cell is read, and what that does to a season's totals when a game is negative.
import { test } from "node:test";
import assert from "node:assert/strict";
import { aggregate, aggregateWithEspn, buildProfile, buildStagedProfile, cell, metaFigures, noBoxScoreGames, sportProfile, type PlayerLogRow, type Stats } from "../src/lib/playerProfile";
import { espnSeasonTotals, type EspnSeasonTotals } from "../src/lib/espnSeason";

const one = (category: string, label: string, value: string | undefined): Stats => ({ [category]: value === undefined ? {} : { [label]: value } });

test("cell keeps the sign of a negative number", () => {
  assert.equal(cell(one("box", "+/-", "-3"), "box", "+/-"), -3);
  assert.equal(cell(one("box", "+/-", "-12"), "box", "+/-"), -12);
  assert.equal(cell(one("rushing", "YDS", "-1"), "rushing", "YDS"), -1);
  assert.equal(cell(one("box", "+/-", "+5"), "box", "+/-"), 5);
  assert.equal(cell(one("box", "+/-", "0"), "box", "+/-"), 0);
});

test("cell splits a made/attempted pair at the slash or the dash between two digits", () => {
  const made = one("box", "FG", "23/33");
  assert.equal(cell(made, "box", "FG", 0), 23);
  assert.equal(cell(made, "box", "FG", 1), 33);
  const dashed = one("box", "3PT", "3-11");
  assert.equal(cell(dashed, "box", "3PT", 0), 3);
  assert.equal(cell(dashed, "box", "3PT", 1), 11);
  assert.equal(cell(one("box", "FT", "0-0"), "box", "FT", 0), 0);
  assert.equal(cell(one("box", "FT", "0-0"), "box", "FT", 1), 0);
});

test("cell reads a missing, empty or dashed cell as null", () => {
  assert.equal(cell(one("box", "+/-", "--"), "box", "+/-"), null);
  assert.equal(cell(one("box", "+/-", ""), "box", "+/-"), null);
  assert.equal(cell(one("box", "+/-", undefined), "box", "+/-"), null);
  assert.equal(cell({}, "box", "+/-"), null);
});

function row(id: string, date: string, stats: Stats): PlayerLogRow {
  return {
    game_espn_id: id, date, season_year: 2025, round: null, week: null, stage: "regular", season_type: 2, competition_type: "STD",
    is_home: true, team_espn_id: "1", team_name: "Home", team_slug: "home", team_abbr: "HOM", team_logo: null,
    opponent_espn_id: "2", opponent_name: "Away", opponent_slug: "away", opponent_abbr: "AWY", opponent_logo: null,
    team_score: 100, opponent_score: 90, result: "W", stats,
  };
}

test("an NBA season's plus/minus average counts a negative game", () => {
  const box = (pm: string): Stats => ({ box: { MIN: "30", PTS: "20", "+/-": pm } });
  const profile = buildProfile("nba", [row("a", "2025-01-01", box("+10")), row("b", "2025-01-03", box("-12")), row("c", "2025-01-05", box("+5"))]);
  // (10 - 12 + 5) / 3 = 1; with the negative read as 0 it would be 5.
  assert.equal(profile.seasons[0].line.pm, 1);
  assert.equal(profile.career.pm, 1);
});

test("an NFL season's rushing yards include a negative game", () => {
  const rush = (yds: string): Stats => ({ rushing: { CAR: "3", YDS: yds, AVG: "0", TD: "0" } });
  const profile = buildProfile("nfl", [row("a", "2025-09-07", rush("100")), row("b", "2025-09-14", rush("-3")), row("c", "2025-09-21", rush("20"))]);
  // 100 - 3 + 20 = 117; with the negative read as 0 it would be 120.
  assert.equal(profile.seasons[0].line.rush_yds, 117);
});

// Real-shaped NBA lines. ESPN lists a stat line for everyone on the bench sheet; a coach's-decision DNP
// comes through with every cell "--" (the extractor already drops didNotPlay and empty lines).
const box = (cells: Record<string, string>): Stats => ({ box: cells });
const FULL = { MIN: "31", PTS: "12", REB: "4", AST: "3", "+/-": "+2" };
const SUB_MINUTE = { MIN: "0", PTS: "0", REB: "0", AST: "1", STL: "0", BLK: "0", TO: "0", FG: "0-0", "3PT": "0-0", FT: "0-0", "+/-": "+3" };
const BENCH_DNP = { MIN: "--", PTS: "--", REB: "--", AST: "--", STL: "--", BLK: "--", TO: "--", FG: "--", "3PT": "--", FT: "--", "+/-": "--" };

/** Played through the profile's rule and through the staged profile's regular-season game count. */
function nbaPlayed(stats: Stats): { rule: boolean; games: number } {
  const r = row("g", "2025-01-01", stats);
  return { rule: sportProfile("nba", [r]).played(r), games: buildStagedProfile("nba", [r]).regular.games };
}

test("NBA: a normal line counts as a game", () => {
  assert.deepEqual(nbaPlayed(box(FULL)), { rule: true, games: 1 });
});

test("NBA: a sub-minute appearance (MIN \"0\", other stats on the line) counts as a game, as ESPN does", () => {
  assert.deepEqual(nbaPlayed(box(SUB_MINUTE)), { rule: true, games: 1 });
});

test("NBA: a bench-sheet line with every stat dashed is not a game", () => {
  assert.deepEqual(nbaPlayed(box(BENCH_DNP)), { rule: false, games: 0 });
  // Dashed minutes with zeroed stats, and dashed minutes with an empty string, are not games either.
  assert.deepEqual(nbaPlayed(box({ MIN: "--", PTS: "0", REB: "0", AST: "0" })), { rule: false, games: 0 });
  assert.deepEqual(nbaPlayed(box({ MIN: "", PTS: "0" })), { rule: false, games: 0 });
});

test("NBA: points on the line make it a game even when the minutes cell is missing", () => {
  assert.deepEqual(nbaPlayed(box({ PTS: "5", REB: "1" })), { rule: true, games: 1 });
  assert.deepEqual(nbaPlayed(box({ MIN: "--", PTS: "5" })), { rule: true, games: 1 });
});

test("NBA: no box score or an empty one is not a game", () => {
  assert.deepEqual(nbaPlayed({}), { rule: false, games: 0 });
  assert.deepEqual(nbaPlayed({ box: {} }), { rule: false, games: 0 });
});

test("an NBA season's games and per-game line count a sub-minute appearance and skip a bench-sheet line", () => {
  const rows = [
    row("a", "2025-01-01", box(SUB_MINUTE)),
    row("b", "2025-01-03", box(BENCH_DNP)),
    row("c", "2025-01-05", box(FULL)),
  ];
  const s = buildStagedProfile("nba", rows);
  assert.equal(s.regular.games, 2);
  assert.equal(s.regular.seasons[0].games, 2);
  // 12 points over the two games he played: (0 + 12) / 2. The dashed line adds no game and no zero.
  assert.equal(s.regular.seasons[0].line.pts, 6);
  assert.equal(s.regular.career.pts, 6);
  // Minutes average over the same two games: (0 + 31) / 2.
  assert.equal(s.regular.seasons[0].line.min, 15.5);
});

// ---------------------------------------------------------------------------
// ESPN's own season line, where the game rows are short of the games ESPN counts.
// ---------------------------------------------------------------------------
const espnLine = (o: Partial<EspnSeasonTotals> = {}): EspnSeasonTotals => ({
  games: 37, starts: 3, minutesPerGame: 10.5, pts: 89, reb: 40, ast: 20, stl: 5, blk: 3, to: 11,
  fgm: 30, fga: 70, tpm: 10, tpa: 30, ftm: 19, fta: 25, ...o,
});
const near = (actual: number | null, expected: number) => assert.ok(actual !== null && Math.abs(actual - expected) < 1e-9, `${actual} is not ${expected}`);

/** A stat line worth `pts` points with a full set of cells. */
const full = (pts: number, extra: Record<string, string> = {}): Stats =>
  box({ GS: "0", MIN: "12", PTS: String(pts), REB: "2", AST: "1", STL: "0", BLK: "0", TO: "1", FG: "2-4", "3PT": "1-2", FT: "1-2", "+/-": "+1", ...extra });
const dnp: Stats = box({ MIN: "--", PTS: "0", REB: "0", AST: "0" });

interface RowOpts { season?: number; team?: string; stage?: PlayerLogRow["stage"]; noBox?: boolean }
function nbaRow(id: string, date: string, stats: Stats, o: RowOpts = {}): PlayerLogRow {
  const team = o.team ?? "1";
  return {
    ...row(id, date, stats),
    season_year: o.season ?? 2025,
    stage: o.stage ?? "regular",
    team_espn_id: team,
    team_name: `Team ${team}`,
    team_slug: `team-${team}`,
    ...(o.noBox ? { no_box_score: true } : {}),
  };
}
/** `n` recorded rows of `pts` points each, dated across January of the given season. */
const games = (n: number, pts: number, o: RowOpts & { prefix?: string } = {}): PlayerLogRow[] =>
  Array.from({ length: n }, (_, i) => nbaRow(`${o.prefix ?? "g"}${i}`, `${o.season ?? 2025}-01-${String(i + 1).padStart(2, "0")}`, full(pts), o));
const listed = (n: number, o: RowOpts & { prefix?: string } = {}): PlayerLogRow[] =>
  Array.from({ length: n }, (_, i) => nbaRow(`${o.prefix ?? "u"}${i}`, `${o.season ?? 2025}-02-${String(i + 1).padStart(2, "0")}`, dnp, { ...o, noBox: true }));
/** A profile without its function fields (rank, value, ...), which differ by reference between two builds. */
const plain = (p: unknown): unknown => JSON.parse(JSON.stringify(p));
const espnFor = (line: EspnSeasonTotals, season = 2025) => new Map([[season, line]]);

test("ESPN line: a season short of ESPN's games shows ESPN's figures", () => {
  const rows = games(7, 6); // 42 points over 7 recorded games
  const p = buildProfile("nba", rows, rows, undefined, espnFor(espnLine()));
  const s = p.seasons[0];
  assert.equal(s.games, 37);
  assert.equal(s.gamesSource, "espn");
  assert.equal(s.lineSource, "espn");
  assert.equal(s.record, null);
  assert.equal(s.recorded, 7);
  assert.equal(s.line.pts, 89 / 37);
  assert.equal(s.line.reb, 40 / 37);
  assert.equal(s.line.gs, 3);
  assert.equal(s.line.min, 10.5);
  near(s.line.fg_pct, (100 * 30) / 70);
  near(s.line.tp_pct, (100 * 10) / 30);
  near(s.line.ft_pct, (100 * 19) / 25);
  assert.equal(s.line.pm, null);
  assert.equal(p.boxOnlyShort, 0);
  assert.equal(p.gamesFromEspn, true);
  assert.equal(p.games, 37);
});

test("ESPN line: ESPN's points below the recorded points fail the guard, and the box line stays", () => {
  const rows = [...games(7, 6), ...listed(2)];
  const p = buildProfile("nba", rows, rows, undefined, espnFor(espnLine({ pts: 30 })));
  const s = p.seasons[0];
  assert.equal(s.lineSource, "box");
  assert.equal(s.line.pts, 42 / 7);
  // Today's games: the logged games plus the two listed.
  assert.equal(s.games, 9);
  assert.equal(s.gamesSource, "listed");
  assert.equal(p.boxOnlyShort, 1);
  // With a stored games figure, the games are that figure (today's rule) and the line is still the box line.
  const reported = buildProfile("nba", rows, rows, new Map([[2025, 37]]), espnFor(espnLine({ pts: 30 })));
  assert.equal(reported.seasons[0].games, 37);
  assert.equal(reported.seasons[0].gamesSource, "espn");
  assert.equal(reported.seasons[0].lineSource, "box");
  assert.equal(reported.boxOnlyShort, 1);
});

test("ESPN line: a season spanning two teams needs ESPN's games to cover the logged and listed games", () => {
  // Two recorded and one listed game for each of two teams: 4 logged + 2 listed.
  const rows = [
    ...games(2, 6, { team: "1", prefix: "a" }),
    ...games(2, 6, { team: "3", prefix: "b" }).map((r, i) => ({ ...r, date: `2025-01-${20 + i}` })),
    ...listed(1, { team: "1", prefix: "ua" }),
    ...listed(1, { team: "3", prefix: "ub" }),
  ];
  const short = buildProfile("nba", rows, rows, undefined, espnFor(espnLine({ games: 5 })));
  assert.equal(short.seasons[0].lineSource, "box");
  assert.equal(short.seasons[0].games, 6);
  assert.equal(short.boxOnlyShort, 1);
  const enough = buildProfile("nba", rows, rows, undefined, espnFor(espnLine({ games: 6 })));
  assert.equal(enough.seasons[0].lineSource, "espn");
  assert.equal(enough.seasons[0].games, 6);
  assert.equal(enough.boxOnlyShort, 0);
});

test("ESPN line: a complete season keeps its box line", () => {
  const rows = games(10, 20);
  for (const gp of [10, 8]) {
    const p = buildProfile("nba", rows, rows, undefined, espnFor(espnLine({ games: gp, pts: 200 })));
    assert.equal(p.seasons[0].lineSource, "box");
    assert.equal(p.seasons[0].gamesSource, "logged");
    assert.equal(p.seasons[0].games, 10);
    assert.equal(p.seasons[0].line.pts, 20);
    assert.equal(p.boxOnlyShort, 0);
  }
});

test("ESPN line: the career combines the seasons' totals over their games", () => {
  const espnSeason = games(7, 6); // 2025, replaced by ESPN's line
  const boxSeason = games(10, 20, { season: 2024, prefix: "h" }).map((r) => ({ ...r, stats: full(20, { GS: "1", MIN: "30", "+/-": "+2", FG: "4-8" }) }));
  const rows = [...espnSeason, ...boxSeason];
  const p = buildProfile("nba", rows, rows, undefined, espnFor(espnLine()));
  assert.deepEqual(p.seasons.map((s) => [s.season, s.lineSource]), [[2025, "espn"], [2024, "box"]]);
  assert.equal(p.career.pts, (89 + 200) / (37 + 10));
  assert.equal(p.career.gs, 10 + 3);
  assert.equal(p.career.min, (10 * 30 + 10.5 * 37) / 47);
  near(p.career.fg_pct, (100 * (40 + 30)) / (80 + 70));
  // A box season has +/- and the ESPN season has none: the career figure would cover only some games.
  assert.notEqual(p.seasons[1].line.pm, null);
  assert.equal(p.career.pm, null);
  assert.equal(p.games, 47);
});

test("ESPN line: a career with no ESPN season is exactly today's", () => {
  const rows = [...games(4, 10), ...games(3, 5, { season: 2024, prefix: "h" })];
  const without = buildProfile("nba", rows);
  assert.deepEqual(plain(buildProfile("nba", rows, rows, undefined, espnFor(espnLine({ games: 3 })))), plain(without));
  assert.equal(without.seasons.every((s) => s.lineSource === "box"), true);
  assert.equal(without.boxOnlyShort, 0);
  assert.notEqual(without.career.pm, null);
});

test("ESPN line: aggregate is aggregateWithEspn with no ESPN seasons", () => {
  const rows = games(5, 8);
  const { specs } = sportProfile("nba", rows);
  assert.deepEqual(aggregate(rows, specs), aggregateWithEspn(rows, [], specs));
});

test("ESPN line: NFL and soccer, and an NBA profile handed no ESPN seasons, are unchanged", () => {
  const rush = (yds: string): Stats => ({ rushing: { CAR: "3", YDS: yds, AVG: "0", TD: "0" } });
  const nfl = [row("a", "2025-09-07", rush("100")), row("b", "2025-09-14", rush("-3"))];
  assert.deepEqual(plain(buildProfile("nfl", nfl, nfl, undefined, espnFor(espnLine()))), plain(buildProfile("nfl", nfl)));
  assert.equal(buildProfile("nfl", nfl, nfl, undefined, espnFor(espnLine())).seasons[0].lineSource, "box");
  const goal: Stats = { match: { APP: "1", SUBIN: "0", G: "1", A: "0", SHOT: "2", SOG: "1" } };
  const soccer = [row("s1", "2025-09-07", goal), row("s2", "2025-09-14", goal)];
  assert.deepEqual(plain(buildProfile("soccer", soccer, soccer, undefined, espnFor(espnLine()))), plain(buildProfile("soccer", soccer)));
  const rows = games(7, 6);
  assert.equal(buildProfile("nba", rows).seasons[0].lineSource, "box");
  assert.equal(buildProfile("nba", rows, rows, undefined, new Map()).seasons[0].lineSource, "box");
});

test("ESPN line: the staged profile gives ESPN's line to the regular season only, and only for the NBA", () => {
  const playoffs = games(4, 25, { stage: "playoffs", prefix: "p" }).map((r, i) => ({ ...r, date: `2025-04-${10 + i}` }));
  const playin = games(2, 15, { stage: "playin", prefix: "i" }).map((r, i) => ({ ...r, date: `2025-04-0${1 + i}` }));
  const rows = [...games(7, 6), ...playoffs, ...playin];
  const staged = buildStagedProfile("nba", rows, undefined, espnFor(espnLine({ pts: 1000, games: 60 })));
  assert.equal(staged.regular.seasons[0].lineSource, "espn");
  assert.equal(staged.regular.seasons[0].games, 60);
  assert.equal(staged.playoffs?.seasons[0].lineSource, "box");
  assert.equal(staged.playoffs?.seasons[0].line.pts, 25);
  assert.equal(staged.playoffs?.seasons[0].games, 4);
  assert.equal(staged.playin?.seasons[0].lineSource, "box");
  assert.equal(staged.playin?.seasons[0].line.pts, 15);
  assert.equal(staged.counted.seasons[0].lineSource, "box");
  // Not the NBA: the map is ignored.
  const rush = (yds: string): Stats => ({ rushing: { CAR: "3", YDS: yds, AVG: "0", TD: "0" } });
  const nfl = [row("a", "2025-09-07", rush("100"))];
  assert.equal(buildStagedProfile("nfl", nfl, undefined, espnFor(espnLine())).regular.seasons[0].lineSource, "box");
});

test("ESPN line: a player in ESPN's log but with no athlete id has no rows listed, and ESPN's games still show", () => {
  // Recorded 7, ESPN 37, and no unrecorded rows to list (the loader could not store a row without an id).
  const rows = games(7, 6);
  const p = buildProfile("nba", rows, rows, undefined, espnFor(espnLine()));
  const s = p.seasons[0];
  assert.equal(s.lineSource, "espn");
  assert.equal(s.unrecorded, 0);
  assert.equal(p.unrecorded, 0);
  assert.equal(s.games - s.recorded, 30);
  assert.equal(noBoxScoreGames("nba", p.games, p.recorded), 30);
  assert.equal(p.recorded, 7);
});

test("ESPN line: a row that is inconsistent with itself is never a line, so the season stays on its box rows", () => {
  const categories = (pts: string) => ({
    averages: { labels: ["GP", "GS", "MIN"], values: ["37", "3", "10.5"] },
    totals: {
      labels: ["FG", "3PT", "FT", "REB", "AST", "BLK", "STL", "TO", "PTS"],
      values: ["30-70", "10-30", "19-25", "40", "20", "3", "5", "11", pts],
    },
  });
  // 2 * 30 + 10 + 19 = 89: consistent. One point more is not.
  assert.equal(espnSeasonTotals(categories("89"))?.pts, 89);
  const bad = espnSeasonTotals(categories("90"));
  assert.equal(bad, null);
  const rows = games(7, 6);
  const fromReader = new Map<number, EspnSeasonTotals>();
  if (bad) fromReader.set(2025, bad);
  const p = buildProfile("nba", rows, rows, undefined, fromReader);
  assert.equal(p.seasons[0].lineSource, "box");
  assert.equal(p.seasons[0].line.pts, 6);
  assert.equal(p.seasons[0].games, 7);
});

test("ESPN line: guard (a) takes ESPN's points equal to the recorded points, and refuses one below", () => {
  const rows = games(7, 6); // 42 recorded points
  assert.equal(buildProfile("nba", rows, rows, undefined, espnFor(espnLine({ pts: 42 }))).seasons[0].lineSource, "espn");
  assert.equal(buildProfile("nba", rows, rows, undefined, espnFor(espnLine({ pts: 41 }))).seasons[0].lineSource, "box");
});

test("ESPN line: a season with ESPN starts or minutes missing has no gs or min, and neither has a career that includes it", () => {
  const espnSeason = games(7, 6);
  const boxSeason = games(10, 20, { season: 2024, prefix: "h" });
  const rows = [...espnSeason, ...boxSeason];
  const noStarts = buildProfile("nba", rows, rows, undefined, espnFor(espnLine({ starts: null })));
  assert.equal(noStarts.seasons[0].lineSource, "espn");
  assert.equal(noStarts.seasons[0].line.gs, null);
  assert.notEqual(noStarts.seasons[0].line.min, null);
  assert.equal(noStarts.career.gs, null);
  assert.notEqual(noStarts.career.min, null);
  const noMinutes = buildProfile("nba", rows, rows, undefined, espnFor(espnLine({ minutesPerGame: null })));
  assert.equal(noMinutes.seasons[0].line.min, null);
  assert.notEqual(noMinutes.seasons[0].line.gs, null);
  assert.equal(noMinutes.career.min, null);
  assert.notEqual(noMinutes.career.gs, null);
});

test("ESPN line: a game row with no season year stays in the career beside an ESPN season", () => {
  const undated: PlayerLogRow = { ...nbaRow("nosn", "2025-03-01", full(20)), season_year: null };
  const rows = [...games(7, 6), undated];
  const p = buildProfile("nba", rows, rows, undefined, espnFor(espnLine()));
  assert.equal(p.seasons[0].lineSource, "espn");
  // ESPN's 89 points over its 37 games, plus the undated game's 20 over one.
  assert.equal(p.career.pts, (89 + 20) / (37 + 1));
  assert.equal(p.games, 38);
});

test("ESPN line: a two-team season that passes guard (b) is the whole of its career", () => {
  const rows = [
    ...games(2, 6, { team: "1", prefix: "a" }),
    ...games(2, 6, { team: "3", prefix: "b" }).map((r, i) => ({ ...r, date: `2025-01-${20 + i}` })),
    ...listed(1, { team: "1", prefix: "ua" }),
    ...listed(1, { team: "3", prefix: "ub" }),
  ];
  const p = buildProfile("nba", rows, rows, undefined, espnFor(espnLine({ games: 6 })));
  assert.equal(p.seasons[0].lineSource, "espn");
  assert.equal(p.seasons[0].teams.length, 2);
  assert.deepEqual(p.career, p.seasons[0].line);
});

// ---------------------------------------------------------------------------
// Milestones: what they count when the profile's games are beyond its rows.
// ---------------------------------------------------------------------------
/** `n` recorded rows, one a day from 2025-01-01, `pts` points each except the rows named in `big` (32 points). */
const daily = (n: number, big: number[] = []): PlayerLogRow[] =>
  Array.from({ length: n }, (_, i) => nbaRow(`d${i + 1}`, new Date(Date.UTC(2025, 0, i + 1)).toISOString().slice(0, 10), full(big.includes(i + 1) ? 32 : 10)));
const labelsOf = (p: ReturnType<typeof buildProfile>) => p.milestones.map((m) => m.label);

test("milestones: games with no row at all leave the Nth game unlocatable, so every ordinal is skipped", () => {
  const rows = daily(60);
  const short = buildProfile("nba", rows, rows, undefined, espnFor(espnLine({ games: 90, pts: 5000 })));
  assert.equal(short.games, 90);
  assert.equal(short.recorded, 60);
  assert.equal(short.unrecorded, 0);
  const labels = labelsOf(short);
  assert.equal(labels.includes("50th game"), false);
  assert.equal(labels.some((l) => /^\d+(st|nd|rd|th) game$/.test(l)), false);
  assert.equal(labels.includes("First game on record"), true);
  const whole = buildProfile("nba", rows, rows, undefined, espnFor(espnLine({ games: 60, pts: 5000 })));
  assert.equal(whole.games, 60);
  assert.equal(whole.milestones.find((m) => m.label === "50th game")?.game?.game_espn_id, "d50");
  assert.equal(labelsOf(whole).includes("First game on record"), true);
});

test("milestones: an ESPN-line season with rows missing skips the ordinals too, and one listed row does not make the rest locatable", () => {
  const rows = [...daily(60), ...listed(1)];
  // 60 recorded + 1 listed = 61 rows in the timeline; ESPN counts 90.
  const espn = buildProfile("nba", rows, rows, undefined, espnFor(espnLine({ games: 90, pts: 5000 })));
  assert.equal(espn.games, 90);
  assert.equal(labelsOf(espn).includes("50th game"), false);
  assert.equal(labelsOf(espn).includes("First game on record"), true);
  // A listed row that is the only gap: the timeline is complete, the ordinals stay.
  const complete = buildProfile("nba", rows, rows);
  assert.equal(complete.games, 61);
  assert.equal(labelsOf(complete).includes("50th game"), true);
});

test("milestones: a count says it is over games with a box score when the profile has games beyond its rows", () => {
  const rows = daily(60, [3, 9]);
  const short = buildProfile("nba", rows, rows, undefined, espnFor(espnLine({ games: 90, pts: 5000 })));
  assert.equal(short.milestones.find((m) => m.label === "30-point game")?.detail, "2 times in games with a box score, most recently");
  const one = buildProfile("nba", daily(60, [3]), daily(60, [3]), undefined, espnFor(espnLine({ games: 90, pts: 5000 })));
  assert.equal(one.milestones.find((m) => m.label === "30-point game")?.detail, "1 time in games with a box score, most recently");
  // Every game has a row: unchanged.
  const whole = buildProfile("nba", rows, rows, undefined, espnFor(espnLine({ games: 60, pts: 5000 })));
  assert.equal(whole.milestones.find((m) => m.label === "30-point game")?.detail, "2 times, most recently");
  const none = buildProfile("nba", rows);
  assert.equal(none.milestones.find((m) => m.label === "30-point game")?.detail, "2 times, most recently");
});

test("milestones: NFL and soccer are untouched when ESPN's games exceed the rows", () => {
  const rush = (id: string, date: string, yds: string): PlayerLogRow => row(id, date, { rushing: { CAR: "20", YDS: yds, AVG: "5", TD: "1" } });
  const rows = [rush("a", "2025-09-07", "120"), rush("b", "2025-09-14", "40")];
  const p = buildProfile("nfl", rows, rows, new Map([[2025, 17]]));
  assert.equal(p.games, 17);
  assert.equal(p.milestones.find((m) => m.label === "100-yard rushing game")?.detail, "1 time, most recently");
});

// ---------------------------------------------------------------------------
// metaFigures: the averages a description may quote.
// ---------------------------------------------------------------------------
test("metaFigures: a season on ESPN's line, or a complete one, quotes its averages", () => {
  const rows = games(7, 6);
  const espn = buildProfile("nba", rows, rows, undefined, espnFor(espnLine()));
  assert.equal(espn.boxOnlyShort, 0);
  assert.equal(metaFigures(espn, "12.0 points"), "12.0 points");
  const complete = buildProfile("nba", rows);
  assert.equal(metaFigures(complete, "6.0 points"), "6.0 points");
});

test("metaFigures: an ESPN season with no game rows of its own still quotes ESPN's averages", () => {
  const rows = listed(3);
  const p = buildProfile("nba", rows, rows, undefined, espnFor(espnLine()));
  assert.equal(p.recorded, 0);
  assert.equal(p.seasons[0].lineSource, "espn");
  assert.equal(metaFigures(p, "2.4 points"), "2.4 points");
});

test("metaFigures: a season still short of ESPN's games on its box rows quotes none", () => {
  const rows = [...games(7, 6), ...listed(2)];
  // Guard (a) fails (ESPN's points below the recorded ones), so the line stays box-only and short.
  const partial = buildProfile("nba", rows, rows, undefined, espnFor(espnLine({ pts: 30 })));
  assert.equal(partial.boxOnlyShort, 1);
  assert.equal(metaFigures(partial, "6.0 points"), null);
  // No ESPN row at all for a season with listed games.
  const noEspn = buildProfile("nba", rows);
  assert.equal(noEspn.boxOnlyShort, 1);
  assert.equal(metaFigures(noEspn, "6.0 points"), null);
  // Every game without a box score and no ESPN line: nothing to average.
  const blank = buildProfile("nba", listed(3));
  assert.equal(blank.recorded, 0);
  assert.equal(metaFigures(blank, "0.0 points"), null);
});

test("metaFigures: one short season among complete ones is enough to quote none", () => {
  const rows = [...games(7, 6, { season: 2024 }), ...games(5, 6, { season: 2025 }), ...listed(2, { season: 2025 })];
  const p = buildProfile("nba", rows);
  assert.equal(p.boxOnlyShort, 1);
  assert.equal(metaFigures(p, "6.0 points"), null);
});

test("metaFigures: NFL and soccer keep quoting whenever a game is recorded", () => {
  const rush = row("a", "2025-09-07", { rushing: { CAR: "20", YDS: "120", AVG: "5", TD: "1" } });
  const nfl = buildProfile("nfl", [rush], [rush], new Map([[2025, 17]]));
  assert.equal(metaFigures(nfl, "120 yards"), "120 yards");
  assert.equal(metaFigures(buildProfile("nfl", []), "0 yards"), null);
});

// ---------------------------------------------------------------------------
// A game with no box score and no season year sits in no season line but is in the games.
// ---------------------------------------------------------------------------
test("boxOnlyShort counts a listed game with no season year, so a description does not quote averages beside its games", () => {
  const orphan: PlayerLogRow = { ...listed(1, { prefix: "x" })[0], season_year: null };
  const rows = [...games(7, 6), orphan];
  const p = buildProfile("nba", rows);
  assert.equal(p.seasons.length, 1);
  assert.equal(p.seasons[0].games, p.seasons[0].recorded);
  assert.equal(p.games, 8);
  assert.equal(p.recorded, 7);
  assert.equal(p.boxOnlyShort, 1);
  assert.equal(metaFigures(p, "6.0 points"), null);
  // Without the orphan the same career is complete.
  const complete = buildProfile("nba", games(7, 6));
  assert.equal(complete.boxOnlyShort, 0);
  assert.equal(metaFigures(complete, "6.0 points"), "6.0 points");
  // It adds one however many such games there are.
  assert.equal(buildProfile("nba", [...games(7, 6), orphan, { ...orphan, game_espn_id: "x9" }]).boxOnlyShort, 1);
});
