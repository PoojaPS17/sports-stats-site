// An NFL regular season ESPN counts games for (player_season_stats.games_played) but that has no box-score row for the
// player (ESPN's box scores omit a player with no stat line) is a season on the player page: ESPN's games and a dash for
// every stat. That holds when ESPN's stored row for the season has no stat but games, and also when the row carries a
// stray stat our box scores never list (a fair catch, an assist, a fumble, a 2-point conversion). The one exception is a
// season in which the player has a playoffs row and ESPN's row has stats: ESPN's regular-season row can then be that
// postseason game (our database holds the same game as a `playoffs` row), so listing it would repeat it. Rows of any other
// stage (regular, other, preseason) do not block it. NBA, soccer and the playoffs are untouched, and every other player's
// page text is what it was.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { startTestDb, type TestDb } from "./helpers/testDb";
import {
  buildProfile,
  buildStagedProfile,
  formatStat,
  hasGames,
  metaFigures,
  ReportedGames,
  reportedForSeason,
  storedGamesOnly,
  type PlayerLogRow,
  type PlayerProfile,
  type StagedProfile,
  type Stats,
} from "../src/lib/playerProfile";
import { fetchPlayerLog, fetchReportedGames } from "../src/lib/playerLog";
import { storedRowHasStats } from "../src/lib/espnSeason";
import { formatSeasonLabel, LEAGUE_LABEL, type League } from "../src/lib/leagues";
import { gamesAndFigures, nflRegularSeasonNote, NFL_STORED_GAMES_NOTE } from "../src/lib/playerCopy";
import { profileSummary, seasonDescription } from "../src/lib/playerDescriptions";
import { careerStripStats, recordText } from "../src/components/PlayerStatsShared";
import { auditPlayersSql, classifyGap, compareSeason, espnFigures, siteSeasons, type StoredCategories } from "../scripts/lib/audit-player-totals";
import type { GameStage } from "../src/lib/gameStage";

const passing = (yds: number): Stats => ({ passing: { "C/ATT": "20/30", YDS: String(yds), TD: "2", INT: "0", RTG: "100.0" } });

function nflGame(id: string, date: string, season: number, stage: GameStage = "regular", result: "W" | "L" = "W"): PlayerLogRow {
  return {
    game_espn_id: id,
    date,
    season_year: season,
    round: null,
    week: null,
    stage,
    season_type: stage === "playoffs" ? 3 : 2,
    competition_type: "STD",
    is_home: true,
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
    team_score: 24,
    opponent_score: 17,
    result,
    stats: passing(200),
  };
}

// Rows in 2019 (two games) and 2021 (one); ESPN counts games in 2019, 2020 (no row at all) and 2021.
const ROWS: PlayerLogRow[] = [nflGame("a1", "2019-09-08", 2019), nflGame("a2", "2019-09-15", 2019, "regular", "L"), nflGame("c1", "2021-09-12", 2021)];
// 2020's stored ESPN row has no stat but games; 2018's has stats.
const STORED = new ReportedGames([[2019, 16], [2020, 5], [2021, 17]], [2020]);
const games = (p: PlayerProfile) => p.seasons.map((s) => [s.season, s.games]);

test("a stored season with no rows and a stat-free stored row becomes a season with ESPN's games and a dash for every stat", () => {
  const p = buildProfile("nfl", ROWS, ROWS, STORED);
  assert.deepEqual(p.seasons.map((s) => s.season), [2021, 2020, 2019]);
  const s = p.seasons[1];
  assert.equal(s.games, 5);
  assert.equal(s.gamesSource, "espn");
  assert.equal(s.recorded, 0);
  assert.equal(s.unrecorded, 0);
  assert.equal(s.record, null);
  assert.equal(s.lineSource, "box");
  assert.deepEqual(s.teams, []);
  // A dash in every column, totals included: never a 0.
  assert.ok(p.profile.specs.length > 0);
  for (const spec of p.profile.specs) {
    assert.equal(s.line[spec.key], null, spec.key);
    assert.equal(formatStat(spec, s.line[spec.key]), "–", spec.key);
  }
  assert.equal(p.games, 16 + 5 + 17);
  assert.equal(p.gamesFromEspn, true);
});

test("the seasons that have rows are exactly what they were without the added one", () => {
  const withGap = buildProfile("nfl", ROWS, ROWS, STORED);
  const without = buildProfile("nfl", ROWS, ROWS, new ReportedGames([[2019, 16], [2021, 17]], [2020]));
  assert.deepEqual(withGap.seasons.filter((s) => s.season !== 2020), without.seasons);
  // Nothing else on the profile reads the added season: totals, splits, best games, milestones and the log are the rows'.
  assert.deepEqual(withGap.career, without.career);
  assert.equal(withGap.rows.length, 3);
  assert.equal(withGap.recorded, 3);
  assert.equal(withGap.unrecorded, 0);
  assert.deepEqual(withGap.homeAway, without.homeAway);
  assert.deepEqual(withGap.opponents, without.opponents);
  assert.deepEqual(withGap.best, without.best);
  assert.deepEqual(withGap.milestones, without.milestones);
  assert.deepEqual(withGap.teams, without.teams);
});

test("the added season drops the career W-L, which no longer covers every game, and the strip reads ESPN's games", () => {
  const p = buildProfile("nfl", ROWS, ROWS, STORED);
  assert.equal(p.record, null);
  assert.deepEqual(careerStripStats(p).slice(0, 2), [
    { label: "GP", value: "38" },
    { label: "W-L", value: "–" },
  ]);
  assert.equal(recordText(p.seasons[1].record, false), "–");
  assert.equal(storedGamesOnly(p), false);
});

test("a stored figure of 0, or none, adds no season", () => {
  const zero = buildProfile("nfl", ROWS, ROWS, new ReportedGames([[2019, 2], [2020, 0], [2021, 1]], [2019, 2020, 2021]));
  assert.deepEqual(zero.seasons.map((s) => s.season), [2021, 2019]);
  const none = buildProfile("nfl", ROWS, ROWS, new ReportedGames([], [2020]));
  assert.deepEqual(none.seasons.map((s) => s.season), [2021, 2019]);
  assert.equal(none.gamesFromEspn, false);
  assert.equal(buildProfile("nfl", ROWS).games, 3);
});

test("buildProfile adds only what its statFree set names: a season not in it is not added, and a plain Map has no such set", () => {
  // The same map as STORED, but 2020 is not in statFree; a plain Map has no stat-free seasons at all. Which seasons with
  // a stat in ESPN's row may be listed is decided one level up, in buildStagedProfile (tests below).
  for (const map of [new ReportedGames([[2019, 16], [2020, 5], [2021, 17]], []), new Map([[2019, 16], [2020, 5], [2021, 17]])]) {
    const p = buildProfile("nfl", ROWS, ROWS, map);
    assert.deepEqual(games(p), [[2021, 17], [2019, 16]]);
  }
});

test("staged NFL: a stored season whose ESPN row has stats is listed like a stat-free one when the player has no playoffs row that season; a plain Map still adds nothing", () => {
  // STORED's 2020 is stat-free; here 2020 carries a stat (not in statFree) and the rows have no playoffs row anywhere.
  const withStat = new ReportedGames([[2019, 16], [2020, 5], [2021, 17]], []);
  const s = buildStagedProfile("nfl", ROWS, withStat).regular;
  assert.deepEqual(games(s), [[2021, 17], [2020, 5], [2019, 16]]);
  const added = s.seasons[1];
  assert.equal(added.gamesSource, "espn");
  assert.equal(added.recorded, 0);
  assert.equal(added.unrecorded, 0);
  assert.equal(added.record, null);
  assert.deepEqual(added.teams, []);
  for (const spec of s.profile.specs) assert.equal(added.line[spec.key], null, spec.key);
  assert.equal(s.games, 38);
  // Exactly what the same player has when 2020 is marked stat-free.
  const statFreeVersion = buildStagedProfile("nfl", ROWS, STORED).regular;
  assert.deepEqual(s.seasons, statFreeVersion.seasons);
  assert.equal(s.games, statFreeVersion.games);
  assert.equal(s.record, statFreeVersion.record);
  // The seasons that have rows are untouched, and the input map is not changed.
  assert.deepEqual(s.seasons.filter((x) => x.season !== 2020), buildProfile("nfl", ROWS, ROWS, new ReportedGames([[2019, 16], [2021, 17]], [])).seasons);
  assert.equal(withStat.statFree.size, 0);
  // A plain Map has no stat-free information: nothing is added, as before.
  assert.deepEqual(games(buildStagedProfile("nfl", ROWS, new Map([[2019, 16], [2020, 5], [2021, 17]])).regular), [[2021, 17], [2019, 16]]);
  assert.deepEqual(games(buildStagedProfile("nfl", ROWS, undefined).regular), [[2021, 1], [2019, 2]]);
});

test("staged NFL: only a playoffs row in the same season blocks a stat-carrying stored season; a preseason row, another stage or a playoffs row in another season does not", () => {
  const stored = (...seasons: [number, number][]) => new ReportedGames(seasons, []);
  const listed = (rows: PlayerLogRow[], map: ReportedGames) => games(buildStagedProfile("nfl", rows, map).regular);
  // Preseason only that season ("excluded"): the season is listed, and the preseason game is in no total.
  const preseason = { ...nflGame("pre", "2020-08-20", 2020, "excluded"), season_type: 1 };
  assert.deepEqual(listed([preseason], stored([2020, 5])), [[2020, 5]]);
  assert.equal(buildStagedProfile("nfl", [preseason], stored([2020, 5])).regular.games, 5);
  assert.equal(buildStagedProfile("nfl", [preseason], stored([2020, 5])).regular.seasons[0].recorded, 0);
  // A regular-season game elsewhere and a playoffs row in a DIFFERENT season: the stored 2020 is listed.
  assert.deepEqual(listed([nflGame("po", "2022-01-15", 2021, "playoffs")], stored([2020, 5])), [[2020, 5]]);
  assert.deepEqual(listed([...ROWS, nflGame("po", "2022-01-15", 2021, "playoffs")], stored([2019, 16], [2020, 5], [2021, 17])), [[2021, 17], [2020, 5], [2019, 16]]);
  // A playoffs row in the SAME season blocks it (the season has no regular row, so nothing else lists it), ...
  assert.deepEqual(listed([nflGame("po", "2021-01-16", 2020, "playoffs")], stored([2020, 5])), []);
  // ... and a preseason row beside it does not lift the block.
  assert.deepEqual(listed([preseason, nflGame("po", "2021-01-16", 2020, "playoffs")], stored([2020, 5])), []);
  // Another season's figure in the same map is decided on its own: 2019 has no playoffs row and is listed, 2020 is blocked.
  assert.deepEqual(listed([nflGame("po", "2021-01-16", 2020, "playoffs")], stored([2019, 16], [2020, 5])), [[2019, 16]]);
  // A stored figure of 0 is never listed.
  assert.deepEqual(listed([], stored([2020, 0])), []);
});

test("staged NFL: a stat-free season is listed even with a playoffs row that season, and a season with rows is still just its rows", () => {
  const po = nflGame("po", "2021-01-16", 2020, "playoffs");
  assert.deepEqual(games(buildStagedProfile("nfl", [po], new ReportedGames([[2020, 5]], [2020])).regular), [[2020, 5]]);
  // A regular row in the season: the figure is ESPN's games as before, whatever the map says about stats or playoffs.
  const rows = [nflGame("a", "2020-09-13", 2020), po];
  assert.deepEqual(games(buildStagedProfile("nfl", rows, new ReportedGames([[2020, 5]], [])).regular), [[2020, 5]]);
  assert.equal(buildStagedProfile("nfl", rows, new ReportedGames([[2020, 5]], [])).regular.seasons[0].recorded, 1);
});

test("a stored season older or newer than every row is still a season, and the order is newest first", () => {
  const p = buildProfile("nfl", ROWS, ROWS, new ReportedGames([[2016, 3], [2019, 16], [2023, 9]], [2016, 2023]));
  assert.deepEqual(p.seasons.map((s) => s.season), [2023, 2021, 2019, 2016]);
  assert.deepEqual(p.seasons.map((s) => s.games), [9, 1, 16, 3]);
});

// ---------------------------------------------------------------------------
// A player with no box-score row in any season.
// ---------------------------------------------------------------------------
const rowless = (map: ReportedGames): StagedProfile => buildStagedProfile("nfl", [], map);

test("no rows anywhere, one stat-free stored season: the season is listed with ESPN's games and no clubs, columns or figures", () => {
  const s = rowless(new ReportedGames([[2025, 11]], [2025]));
  assert.deepEqual(games(s.regular), [[2025, 11]]);
  assert.equal(s.regular.games, 11);
  assert.deepEqual(s.regular.seasons[0].teams, []);
  assert.deepEqual(s.regular.profile.specs, []);
  assert.equal(s.regular.record, null);
  assert.equal(s.regular.recorded, 0);
  assert.deepEqual(careerStripStats(s.regular), [
    { label: "GP", value: "11" },
    { label: "W-L", value: "–" },
  ]);
  assert.equal(storedGamesOnly(s.regular), true);
  assert.equal(hasGames(s), true);
  // The other stages have nothing, and there is no log.
  assert.equal(s.playoffs, null);
  assert.equal(s.playin, null);
  assert.equal(s.counted.games, 0);
  assert.equal(s.log.length, 0);
});

test("no rows anywhere, two stat-free stored seasons: both are listed, newest first, and the games add up", () => {
  const s = rowless(new ReportedGames([[2021, 2], [2022, 6], [2023, 0]], [2021, 2022, 2023]));
  assert.deepEqual(games(s.regular), [[2022, 6], [2021, 2]]);
  assert.equal(s.regular.games, 8);
  assert.equal(storedGamesOnly(s.regular), true);
});

test("no rows anywhere, and the stored season carries a stat (a fair catch, a fumble, a 2-point conversion): the season is listed with ESPN's games and a dash for every stat", () => {
  const s = rowless(new ReportedGames([[2025, 1]], []));
  assert.deepEqual(games(s.regular), [[2025, 1]]);
  const season = s.regular.seasons[0];
  assert.equal(season.games, 1);
  assert.equal(season.gamesSource, "espn");
  assert.equal(season.recorded, 0);
  assert.equal(season.unrecorded, 0);
  assert.equal(season.record, null);
  assert.deepEqual(season.teams, []);
  assert.equal(season.lineSource, "box");
  // Every stat is a dash (null), never a 0; the profile has no columns of its own without rows.
  assert.deepEqual(s.regular.profile.specs, []);
  assert.deepEqual(season.line, buildStagedProfile("nfl", [], new ReportedGames([[2025, 1]], [2025])).regular.seasons[0].line);
  assert.equal(s.regular.games, 1);
  assert.equal(s.regular.recorded, 0);
  assert.equal(s.regular.record, null);
  assert.equal(storedGamesOnly(s.regular), true);
  assert.equal(hasGames(s), true);
  assert.equal(s.playoffs, null);
  assert.equal(s.counted.games, 0);
  assert.equal(s.log.length, 0);
});

test("a Kinnard- or Doyle-like season (ESPN's regular-season row is really a postseason game, and it has stats) is not listed as a regular season, while the playoffs table holds the game", () => {
  // The playoffs row is in the same season as the stored figure: the regular season stays empty, as it was.
  const withPlayoff = buildStagedProfile("nfl", [nflGame("po", "2026-01-11", 2025, "playoffs")], new ReportedGames([[2025, 1]], []));
  assert.deepEqual(withPlayoff.regular.seasons, []);
  assert.equal(withPlayoff.regular.games, 0);
  assert.ok(withPlayoff.playoffs);
  assert.equal(withPlayoff.playoffs.games, 1);
  assert.equal(hasGames(withPlayoff), true);
});

test("a stored season with a stat outside the yard columns (tackles, sacks) carries stats too, and only one with none is stat-free", () => {
  const cat = (labels: string[], values: string[]) => ({ labels, values });
  assert.equal(storedRowHasStats({ defensive: cat(["GP", "TOT", "SACK"], ["5", "2", "0.0"]) }), true);
  assert.equal(storedRowHasStats({ defensive: cat(["GP", "TOT", "SACK"], ["5", "0", "0.5"]) }), true);
  assert.equal(storedRowHasStats({ receiving: cat(["GP", "REC", "YDS", "TD"], ["1", "1", "6", "0"]) }), true);
  assert.equal(storedRowHasStats({ defensive: cat(["GP", "TOT", "SACK", "AVG"], ["16", "0", "0.0", "--"]), general: cat(["GP", "GS", "FUM"], ["16", "10", "0"]) }), false);
  assert.equal(storedRowHasStats({ rushing: cat(["GP", "CAR", "YDS", "AVG", "LNG"], ["3", "0", "0", "0.0", "0"]), kicking: cat(["GP", "FG", "PCT"], ["3", "0-0", ""]) }), false);
  assert.equal(storedRowHasStats({ rushing: cat(["GP", "YDS"], ["1,200", "1,200"]) }), true);
  // A row with nothing in it has no stat; one that cannot be read is not called stat-free.
  assert.equal(storedRowHasStats({}), false);
  assert.equal(storedRowHasStats(null), false);
  assert.equal(storedRowHasStats({ defensive: { labels: ["GP"] } }), true);
  assert.equal(storedRowHasStats({ defensive: "x" }), true);
});

test("a player with only playoff rows: the stat-free regular season is listed in the regular-season table alone", () => {
  const rows = [nflGame("po", "2022-01-15", 2021, "playoffs")];
  const s = buildStagedProfile("nfl", rows, new ReportedGames([[2021, 3]], [2021]));
  assert.deepEqual(games(s.regular), [[2021, 3]]);
  assert.equal(storedGamesOnly(s.regular), true);
  assert.ok(s.playoffs);
  assert.deepEqual(s.playoffs.seasons.map((x) => [x.season, x.games, x.gamesSource]), [[2021, 1, "logged"]]);
  assert.equal(s.counted.games, 1);
  assert.equal(hasGames(s), true);
  // The columns are the playoff rows', so every column is a dash for the regular season.
  assert.ok(s.regular.profile.specs.length > 0);
  assert.ok(s.regular.profile.specs.every((sp) => s.regular.seasons[0].line[sp.key] === null));
});

test("NBA and soccer ignore stored seasons that have no rows, whatever is marked stat-free", () => {
  const box = (pts: number): Stats => ({ box: { MIN: "30", PTS: String(pts), REB: "5", AST: "5" } });
  const nbaRows = [{ ...nflGame("n1", "2025-01-10", 2025), stats: box(20) }, { ...nflGame("n2", "2025-01-17", 2025), stats: box(10) }];
  const map = new ReportedGames([[2024, 60], [2025, 2]], [2024, 2025]);
  const withMap = buildStagedProfile("nba", nbaRows, map).regular;
  const plain = buildStagedProfile("nba", nbaRows).regular;
  assert.deepEqual(withMap.seasons.map((s) => s.season), [2025]);
  assert.deepEqual(withMap.seasons, plain.seasons);
  assert.equal(withMap.games, 2);
  assert.deepEqual(buildProfile("nba", nbaRows, nbaRows, map).seasons, buildProfile("nba", nbaRows).seasons);
  assert.deepEqual(buildStagedProfile("nba", [], map).regular.seasons, []);

  const goal = (g: number): Stats => ({ match: { APP: "1", SUBIN: "0", G: String(g), A: "0", SHOT: "1", SOG: "1", FC: "0", FA: "0", YC: "0", RC: "0" } });
  const soccerRows = [{ ...nflGame("s1", "2025-01-10", 2025), stats: goal(1) }, { ...nflGame("s2", "2025-01-17", 2025), stats: goal(0) }];
  const soccer = buildStagedProfile("soccer", soccerRows, map).regular;
  assert.deepEqual(soccer.seasons.map((s) => s.season), [2025]);
  assert.equal(soccer.games, 2);
  assert.deepEqual(buildProfile("soccer", soccerRows, soccerRows, map).seasons, buildProfile("soccer", soccerRows).seasons);
  assert.deepEqual(buildStagedProfile("soccer", [], map).regular.seasons, []);
});

test("staged NFL: the added season is in the regular-season table only, never in the playoffs, play-in or counted profiles", () => {
  const rows = [...ROWS, nflGame("po", "2022-01-15", 2021, "playoffs")];
  const s = buildStagedProfile("nfl", rows, STORED);
  assert.deepEqual(s.regular.seasons.map((x) => x.season), [2021, 2020, 2019]);
  assert.equal(s.regular.seasons[1].games, 5);
  assert.ok(s.playoffs);
  assert.deepEqual(s.playoffs.seasons.map((x) => [x.season, x.games, x.gamesSource]), [[2021, 1, "logged"]]);
  assert.equal(s.playoffs.games, 1);
  assert.equal(s.playin, null);
  assert.deepEqual(s.counted.seasons.map((x) => x.season), [2021, 2019]);
  assert.equal(s.counted.games, 4);
  // The game log has only real games.
  assert.equal(s.log.length, 4);
});

test("the season page reads one season: it is handed that season's stored figure alone (and whether it is stat-free), so it lists no other", () => {
  assert.deepEqual([...reportedForSeason(STORED, 2019).entries()], [[2019, 16]]);
  assert.equal(reportedForSeason(STORED, 2018).size, 0);
  assert.equal(reportedForSeason(STORED, 2020).statFree.has(2020), true);
  assert.equal(reportedForSeason(STORED, 2019).statFree.has(2019), false);
  assert.equal(reportedForSeason(new Map([[2020, 5]]), 2020).statFree.size, 0);
  const forSeason = (season: number) => buildStagedProfile("nfl", ROWS.filter((r) => r.season_year === season), reportedForSeason(STORED, season)).regular;
  // A season with rows: just itself, as before.
  assert.deepEqual(games(forSeason(2019)), [[2019, 16]]);
  assert.equal(forSeason(2019).games, 16);
  // A stat-free stored season with no rows is a season of its own, alone.
  assert.deepEqual(games(forSeason(2020)), [[2020, 5]]);
  assert.equal(forSeason(2020).games, 5);
});

test("the season page path: only that season's rows and reportedForSeason(...) give the same answer as the player page's whole log", () => {
  const withStat = new ReportedGames([[2019, 16], [2020, 5], [2021, 17]], []);
  const po2020 = nflGame("po20", "2021-01-16", 2020, "playoffs");
  // The player page: every row. The season page: that season's rows only, and that season's figure alone.
  const page = (rows: PlayerLogRow[], map: ReportedGames, season: number) => ({
    player: buildStagedProfile("nfl", rows, map).regular.seasons.filter((x) => x.season === season).map((x) => [x.season, x.games, x.gamesSource, x.recorded]),
    season: buildStagedProfile("nfl", rows.filter((r) => r.season_year === season), reportedForSeason(map, season)).regular.seasons.map((x) => [x.season, x.games, x.gamesSource, x.recorded]),
  });
  // A stat-carrying stored season with no rows is listed on both.
  const listed = page(ROWS, withStat, 2020);
  assert.deepEqual(listed.player, [[2020, 5, "espn", 0]]);
  assert.deepEqual(listed.season, listed.player);
  // With that season's playoffs row it is on neither (the playoffs row is in the season page's rows too) ...
  const blocked = page([...ROWS, po2020], withStat, 2020);
  assert.deepEqual(blocked.player, []);
  assert.deepEqual(blocked.season, []);
  // ... but a playoffs row in another season does not block it, and a stat-free season is listed either way.
  const other = page([...ROWS, nflGame("po21", "2022-01-15", 2021, "playoffs")], withStat, 2020);
  assert.deepEqual(other.season, [[2020, 5, "espn", 0]]);
  assert.deepEqual(other.season, other.player);
  assert.deepEqual(page([...ROWS, po2020], STORED, 2020).season, [[2020, 5, "espn", 0]]);
});

test("the season page hands both of its profile builds the one season's figure, not the whole stored map", () => {
  const source = readFileSync("src/app/[league]/players/[slug]/[season]/page.tsx", "utf8");
  const calls = source.match(/buildStagedProfile\(sport,[^\n]*\)/g) ?? [];
  assert.equal(calls.length, 2);
  for (const call of calls) assert.match(call, /reportedForSeason\(reportedGames, /);
});

// ---------------------------------------------------------------------------
// The text: true for a player with games and no rows, and what it was for everyone else.
// ---------------------------------------------------------------------------
// The player page's summary and the season page's description exactly as they were before stored-only players existed.
function legacyProfileSummary(league: League, name: string, profile: PlayerProfile | null, short = false): string {
  if (!profile || profile.games === 0) return `${name} ${LEAGUE_LABEL[league]} stats, season by season, with a game-by-game log.`;
  const headline = profile.profile.specs.filter((s) => s.headline).slice(0, 3);
  const perGame = profile.sport === "nba" && headline.every((s) => s.agg === "avg");
  const figures = headline.map((s) => `${formatStat(s, profile.career[s.key])} ${s.title.toLowerCase()}${!perGame && profile.sport === "nba" && s.agg === "avg" ? " per game" : ""}`);
  const teams = profile.teams.map((t) => t.name);
  const since = profile.seasons[profile.seasons.length - 1]?.season;
  const gamesText = `${profile.games} ${profile.profile.gamesLabel === "Apps" ? "appearances" : "games"}`;
  const quoted = metaFigures(profile, `${figures.join(", ")}${perGame ? " per game" : ""}`);
  const lead = `${name} ${LEAGUE_LABEL[league]} stats: ${gamesAndFigures(gamesText, quoted)} for ${teams.join(" and ")}${since ? ` since ${formatSeasonLabel(league, since)}` : ""}.`;
  if (!short) return `${lead} Season-by-season totals, full game log, home and away and opponent splits, best games and milestones.`;
  const tail = " Game log, splits and best games.";
  return lead.length + tail.length <= 160 ? lead + tail : lead;
}

function legacySeasonDescription(league: League, name: string, seasonLabel: string, p: PlayerProfile | null): string {
  let figures = "";
  if (p && p.games > 0) {
    const headline = p.profile.specs.filter((s) => s.headline).slice(0, 3);
    const quoted = metaFigures(p, headline.map((s) => `${formatStat(s, p.career[s.key])} ${s.title.toLowerCase()}`).join(", "));
    figures = ` ${gamesAndFigures(`${p.games} ${p.profile.gamesLabel === "Apps" ? "appearances" : "games"}`, quoted)} for ${p.teams.map((t) => t.name).join(" and ")}.`;
  }
  return `${name} ${LEAGUE_LABEL[league]} statistics for the ${seasonLabel} season.${figures} Game-by-game log, splits and best games.`;
}

const nbaBox = (pts: number): Stats => ({ box: { MIN: "30", PTS: String(pts), REB: "5", AST: "5" } });
const nbaBlank: Stats = { box: { MIN: "--", PTS: "0", REB: "0", AST: "0" } };
const soccerLine = (g: number): Stats => ({ match: { APP: "1", SUBIN: "0", G: String(g), A: "0", SHOT: "1", SOG: "1", FC: "0", FA: "0", YC: "0", RC: "0" } });
const withStats = (r: PlayerLogRow, stats: Stats): PlayerLogRow => ({ ...r, stats });

// Every kind of profile that has rows or no games at all, each for the league it belongs to.
const EXISTING: { name: string; league: League; staged: StagedProfile }[] = [
  { name: "NFL with rows and a stored figure", league: "nfl", staged: buildStagedProfile("nfl", ROWS, new ReportedGames([[2019, 16], [2021, 17]], [])) },
  { name: "NFL with rows and no map", league: "nfl", staged: buildStagedProfile("nfl", ROWS) },
  { name: "NFL with rows, a playoffs row and a stored figure", league: "nfl", staged: buildStagedProfile("nfl", [...ROWS, nflGame("po", "2022-01-15", 2021, "playoffs")], new ReportedGames([[2019, 16]], [])) },
  // Not listed as a regular season: the stored season has stats and the playoffs row is in it (Kinnard/Doyle).
  { name: "NFL with only playoff rows, stored season with stats", league: "nfl", staged: buildStagedProfile("nfl", [nflGame("po", "2026-01-11", 2025, "playoffs")], new ReportedGames([[2025, 1]], [])) },
  { name: "NFL with a plain Map of stored figures and no rows", league: "nfl", staged: buildStagedProfile("nfl", [], new Map([[2025, 1]])) },
  { name: "NFL with nothing", league: "nfl", staged: buildStagedProfile("nfl", []) },
  { name: "NBA", league: "nba", staged: buildStagedProfile("nba", [withStats(nflGame("n1", "2025-01-10", 2025), nbaBox(20)), withStats(nflGame("n2", "2025-01-17", 2025), nbaBox(10))]) },
  { name: "NBA with a stored figure and a game with no box score", league: "nba", staged: buildStagedProfile("nba", [withStats(nflGame("n1", "2025-01-10", 2025), nbaBox(20)), { ...withStats(nflGame("n2", "2025-01-17", 2025), nbaBlank), no_box_score: true }], new ReportedGames([[2025, 5]], [2025])) },
  { name: "NBA with nothing", league: "nba", staged: buildStagedProfile("nba", []) },
  { name: "soccer", league: "epl", staged: buildStagedProfile("soccer", [withStats(nflGame("s1", "2025-01-10", 2025), soccerLine(1)), withStats(nflGame("s2", "2025-01-17", 2025), soccerLine(0))]) },
];

test("every existing profile keeps exactly the summary, season description and page test it had", () => {
  for (const { name, league, staged } of EXISTING) {
    for (const [label, p] of [["regular", staged.regular], ["counted", staged.counted]] as const) {
      assert.equal(profileSummary(league, "Test Player", p), legacyProfileSummary(league, "Test Player", p), `${name} ${label} long`);
      assert.equal(profileSummary(league, "Test Player", p, true), legacyProfileSummary(league, "Test Player", p, true), `${name} ${label} short`);
      assert.equal(seasonDescription(league, "Test Player", "2025", p.games > 0 ? p : null), legacySeasonDescription(league, "Test Player", "2025", p), `${name} ${label} season`);
    }
    assert.equal(seasonDescription(league, "Test Player", "2025", null), legacySeasonDescription(league, "Test Player", "2025", null), `${name} no profile`);
    assert.equal(hasGames(staged), staged.log.length > 0 || staged.counted.games > 0, `${name} hasGames`);
    assert.equal(storedGamesOnly(staged.regular), false, `${name} stored only`);
    assert.equal(nflRegularSeasonNote(staged.regular.gamesFromEspn), nflRegularSeasonNote(staged.regular.gamesFromEspn, storedGamesOnly(staged.regular)), `${name} note`);
  }
  assert.equal(hasGames(null), false);
});

test("a player with no rows and stored games gets sentences that claim only the games", () => {
  const one = rowless(new ReportedGames([[2025, 11]], [2025])).regular;
  const two = rowless(new ReportedGames([[2021, 2], [2022, 6]], [2021, 2022])).regular;
  const single = rowless(new ReportedGames([[2024, 1]], [2024])).regular;
  assert.equal(profileSummary("nfl", "Frank Crum", one), "Frank Crum NFL stats: 11 games played in 2025, as counted by ESPN.");
  assert.equal(profileSummary("nfl", "Frank Crum", one, true), profileSummary("nfl", "Frank Crum", one));
  assert.equal(profileSummary("nfl", "Frank Crum", two), "Frank Crum NFL stats: 8 games played from 2021 to 2022, as counted by ESPN.");
  assert.equal(profileSummary("nfl", "Frank Crum", single), "Frank Crum NFL stats: 1 game played in 2024, as counted by ESPN.");
  assert.equal(seasonDescription("nfl", "Frank Crum", "2025", one), "Frank Crum NFL statistics for the 2025 season. 11 games in the regular season, as counted by ESPN.");
  for (const text of [profileSummary("nfl", "X", one), profileSummary("nfl", "X", two), seasonDescription("nfl", "X", "2025", one)]) {
    assert.doesNotMatch(text, /No games on record|for \.| for \s|summed from|\b0 games|full game log|Game-by-game|splits|milestones|best games/i);
  }
  // A stored season with a stat and no rows is listed now, so its sentence claims only the games too.
  assert.equal(profileSummary("nfl", "Andrew Thomas", rowless(new ReportedGames([[2025, 1]], [])).regular), "Andrew Thomas NFL stats: 1 game played in 2025, as counted by ESPN.");
  // Truly no stored games (none, a figure of 0, or a stat-carrying season with a playoffs row): what it said before.
  assert.equal(profileSummary("nfl", "X", rowless(new ReportedGames([], [])).regular), "X NFL stats, season by season, with a game-by-game log.");
  assert.equal(profileSummary("nfl", "X", rowless(new ReportedGames([[2025, 0]], [])).regular), "X NFL stats, season by season, with a game-by-game log.");
  const kinnard = buildStagedProfile("nfl", [nflGame("po", "2026-01-11", 2025, "playoffs")], new ReportedGames([[2025, 1]], []));
  assert.equal(profileSummary("nfl", "X", kinnard.regular), legacyProfileSummary("nfl", "X", kinnard.regular));
  // The section note says the site has no stat line for these games.
  assert.equal(nflRegularSeasonNote(true, true), NFL_STORED_GAMES_NOTE);
  assert.match(NFL_STORED_GAMES_NOTE, /no box-score stat line/);
});

test("the player page text is built from storedGamesOnly, so no sentence about a count of games with a stat line or a club reaches it", () => {
  const source = readFileSync("src/app/[league]/players/[slug]/page.tsx", "utf8");
  assert.match(source, /const storedOnly = storedGamesOnly\(profile\)/);
  assert.match(source, /regularNoBoxScore === 0 && !storedOnly/);
  assert.match(source, /nflRegularSeasonNote\(profile\.gamesFromEspn, storedOnly\)/);
  assert.match(source, /storedOnly \? NFL_NO_GAME_LOG_NOTE/);
  assert.match(source, /profileSummary\(league, player\.name, profile\)/);
});

// ---------------------------------------------------------------------------
// End to end on the throwaway database: what the player page, the season page and the audit read.
// ---------------------------------------------------------------------------
let db: TestDb;
let getPlayerSeasons: typeof import("../src/lib/queries").getPlayerSeasons;

const receiving = { receiving: { labels: ["GP", "REC", "YDS", "TD"], values: ["1", "1", "6", "0"] } };
const tackles = { defensive: { labels: ["GP", "TOT", "SACK"], values: ["7", "3", "0.0"] } };
const nothing = (gp: number) => ({ defensive: { labels: ["GP", "TOT", "SACK", "AVG"], values: [String(gp), "0", "0.0", "--"] }, general: { labels: ["GP", "FUM"], values: [String(gp), "0"] } });

before(async () => {
  db = await startTestDb();
  ({ getPlayerSeasons } = await import("../src/lib/queries"));
  await db.pool.query(`insert into teams (league, espn_id, name, slug) values ('nfl', '1', 'One', 'one'), ('nfl', '2', 'Two', 'two')`);
  const game = async (id: string, season: number, seasonType: number, date: string, players: string[]) => {
    await db.pool.query(
      `insert into games (league, espn_id, date, name, season_year, home_team_espn_id, away_team_espn_id, home_score, away_score, completed, season_type, competition_type)
       values ('nfl', $1, $2, 'x', $3, '1', '2', 24, 17, true, $4, 'STD')`,
      [id, date, season, seasonType]
    );
    for (const player of players) {
      await db.pool.query(`insert into player_game_stats (league, game_espn_id, player_espn_id, team_espn_id, stats) values ('nfl', $1, $2, '1', $3)`, [id, player, JSON.stringify(player === "kinnard" ? receiving : passing(250))]);
    }
  };
  await game("g19", 2019, 2, "2019-10-06T18:00:00Z", ["p1"]);
  await game("g21", 2021, 2, "2021-10-06T18:00:00Z", ["p1"]);
  await game("po25", 2025, 3, "2026-01-11T18:00:00Z", ["kinnard"]);
  const season = (year: number, player: string, gp: number | null, categories: object = {}, receivingYards: number | null = null) =>
    db.pool.query(`insert into player_season_stats (league, season, player_espn_id, team_espn_id, games_played, categories, receiving_yards) values ('nfl', $1, $2, '1', $3, $4, $5)`, [year, player, gp, JSON.stringify(categories), receivingYards]);
  await season(2019, "p1", 16, nothing(16));
  await season(2020, "p1", 5, nothing(5));
  await season(2021, "p1", 17, tackles);
  await season(2022, "p1", 0, nothing(0));
  await season(2019, "lineman", 16, nothing(16));
  await season(2021, "lineman", 2, nothing(2));
  await season(2025, "kinnard", 1, receiving, 6);
  await season(2024, "hurt", 7, tackles);
  await season(2023, "yardsonly", 4, {}, 12);
});

after(async () => {
  await (await import("../src/lib/db")).pool.end();
  await db?.stop();
});

test("database: the stored season is listed only when its ESPN row is stat-free, and the season page's guard lists it, so the link is never a 404", async () => {
  const [log, reported, seasons] = await Promise.all([fetchPlayerLog(db.pool, "nfl", "p1"), fetchReportedGames(db.pool, "nfl", "p1"), getPlayerSeasons("nfl", "p1")]);
  assert.deepEqual([...reported.statFree].sort(), [2019, 2020]);
  const regular = buildStagedProfile("nfl", log, reported).regular;
  assert.deepEqual(regular.seasons.map((s) => [s.season, s.games, s.gamesSource, s.recorded]), [[2021, 17, "espn", 1], [2020, 5, "espn", 0], [2019, 16, "espn", 1]]);
  assert.equal(regular.games, 38);
  // The [season] page shows a season only when it is a log season or a stored one (`seasons.includes(season)`).
  const pageSeasons = new Set([...log.map((r) => r.season_year), ...seasons]);
  for (const s of regular.seasons) assert.ok(pageSeasons.has(s.season), `season ${s.season} must have a page`);
  // A stored figure of 0 is neither a season of the profile nor a stored figure.
  assert.equal(reported.has(2022), false);
});

test("database: a player with stat-free stored seasons and no rows has them as seasons (1 and 2 seasons), and a page that says so truly", async () => {
  const [log, reported] = await Promise.all([fetchPlayerLog(db.pool, "nfl", "lineman"), fetchReportedGames(db.pool, "nfl", "lineman")]);
  assert.equal(log.length, 0);
  const staged = buildStagedProfile("nfl", log, reported);
  assert.deepEqual(games(staged.regular), [[2021, 2], [2019, 16]]);
  assert.equal(hasGames(staged), true);
  assert.equal(profileSummary("nfl", "L", staged.regular), "L NFL stats: 18 games played from 2019 to 2021, as counted by ESPN.");
  assert.deepEqual(await getPlayerSeasons("nfl", "lineman"), [2021, 2019]);
});

test("database: a player whose stored row has stats and only a playoffs row that season (a Kinnard-like season) gets no regular season, and the gap says why", async () => {
  const [log, reported] = await Promise.all([fetchPlayerLog(db.pool, "nfl", "kinnard"), fetchReportedGames(db.pool, "nfl", "kinnard")]);
  assert.equal(reported.get(2025), 1);
  assert.equal(reported.statFree.has(2025), false);
  const staged = buildStagedProfile("nfl", log, reported);
  assert.deepEqual(staged.regular.seasons, []);
  assert.equal(staged.regular.games, 0);
  assert.ok(staged.playoffs);
  assert.equal(staged.playoffs.games, 1);
  // The audit: ESPN has the season, the site lists no regular season: a coverage gap, and it is ESPN's postseason stats.
  const espn = espnFigures("nfl", receiving as StoredCategories, 1)!;
  const playoffRows = log.filter((r) => r.stage === "playoffs" && r.season_year === 2025).length;
  assert.equal(playoffRows, 1);
  assert.equal(compareSeason({ games: 0, figures: {} }, espn, { league: "nfl" }).verdict, "no box scores");
  assert.match(classifyGap("nfl", receiving as StoredCategories, playoffRows)!, /likely ESPN's postseason stats in its regular-season row/);
  assert.match(classifyGap("nfl", receiving as StoredCategories, 0)!, /no rows that season/);
  assert.equal(classifyGap("nfl", nothing(3) as StoredCategories, 0), null);
  assert.equal(classifyGap("nfl", undefined, 0), null);
});

test("database: a stored row with tackles or yard totals only, and no rows, is not stat-free but is listed all the same (no playoffs row)", async () => {
  const hurt = await fetchReportedGames(db.pool, "nfl", "hurt");
  assert.equal(hurt.get(2024), 7);
  assert.equal(hurt.statFree.has(2024), false);
  assert.deepEqual(games(buildStagedProfile("nfl", [], hurt).regular), [[2024, 7]]);
  // A row with no categories but a yard column is not stat-free either.
  const yards = await fetchReportedGames(db.pool, "nfl", "yardsonly");
  assert.equal(yards.get(2023), 4);
  assert.equal(yards.statFree.has(2023), false);
  assert.deepEqual(games(buildStagedProfile("nfl", [], yards).regular), [[2023, 4]]);
  // The same stored rows are not listed when the player has a playoffs row in that season (the Kinnard case, from the database).
  const withPlayoff = (season: number) => [nflGame("po", `${season + 1}-01-11`, season, "playoffs")];
  assert.deepEqual(buildStagedProfile("nfl", withPlayoff(2024), hurt).regular.seasons, []);
  assert.deepEqual(buildStagedProfile("nfl", withPlayoff(2023), yards).regular.seasons, []);
});

test("database: an audited listed season compares like any other: ESPN's zeros match, a stat is a mismatch", async () => {
  const [log, reported] = await Promise.all([fetchPlayerLog(db.pool, "nfl", "p1"), fetchReportedGames(db.pool, "nfl", "p1")]);
  const site = siteSeasons("nfl", buildStagedProfile("nfl", log, reported).regular).get(2020)!;
  assert.deepEqual(site, { games: 5, gamesSource: "espn", figures: { passYds: 0, passTd: 0, rushYds: 0, rushTd: 0, recYds: 0, recTd: 0 } });
  assert.equal(compareSeason(site, espnFigures("nfl", nothing(5) as StoredCategories, 5), { league: "nfl" }).verdict, "match");
  const withYards = espnFigures("nfl", { ...nothing(5), receiving: { labels: ["GP", "REC", "YDS", "TD"], values: ["5", "1", "6", "0"] } } as StoredCategories, 5);
  const bad = compareSeason(site, withYards, { league: "nfl" });
  assert.equal(bad.verdict, "MISMATCH");
  assert.deepEqual(bad.differences, [{ field: "recYds", site: 0, espn: 6 }]);
});

test("database: the audit reads the players with a stored games figure and no rows too, for the NFL only when asked", async () => {
  const ids = async (sql: string, league: string) => (await db.pool.query<{ id: string }>(sql, [league, null])).rows.map((r) => r.id);
  assert.deepEqual(await ids(auditPlayersSql(false), "nfl"), ["kinnard", "p1"]);
  assert.deepEqual(await ids(auditPlayersSql(true), "nfl"), ["hurt", "kinnard", "lineman", "p1", "yardsonly"]);
  assert.deepEqual(await ids(auditPlayersSql(true), "nba"), []);
});

test("database: the audit's player list never includes an ESPN pseudo-athlete (a negative id), whether it has box rows or a stored games figure", async () => {
  await db.pool.query(
    `insert into player_game_stats (league, game_espn_id, player_espn_id, team_espn_id, stats) values ('nfl', 'pseudo-audit-game', '-8801', '1', '{}'::jsonb)`
  );
  await db.pool.query(
    `insert into player_season_stats (league, season, player_espn_id, team_espn_id, games_played) values ('nfl', 2024, '-8802', '1', 5)`
  );
  try {
    const ids = async (sql: string) => (await db.pool.query<{ id: string }>(sql, ["nfl", null])).rows.map((r) => r.id);
    assert.deepEqual(await ids(auditPlayersSql(false)), ["kinnard", "p1"]);
    assert.deepEqual(await ids(auditPlayersSql(true)), ["hurt", "kinnard", "lineman", "p1", "yardsonly"]);
  } finally {
    await db.pool.query(`delete from player_game_stats where game_espn_id = 'pseudo-audit-game'`);
    await db.pool.query(`delete from player_season_stats where player_espn_id = '-8802'`);
  }
});
