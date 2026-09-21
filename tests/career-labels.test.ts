// A player's totals cover the seasons on the site (the league's HISTORY_START), not the whole career, and every page that
// showed "Career" says so through one helper.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { startTestDb, type TestDb } from "./helpers/testDb";
import { careerStripSuffix, careerWording } from "../src/lib/playerCopy";
import { buildStagedProfile, type PlayerLogRow, type Stats } from "../src/lib/playerProfile";
import type { League } from "../src/lib/leagues";

let db: TestDb;
let PlayerCareerStrip: typeof import("../src/components/PlayerCareerStrip").PlayerCareerStrip;
let PlayerSeasonTable: typeof import("../src/components/PlayerSeasonTable").PlayerSeasonTable;
let PlayerExportCard: typeof import("../src/components/PlayerExportCard").PlayerExportCard;

before(async () => {
  db = await startTestDb();
  ({ PlayerCareerStrip } = await import("../src/components/PlayerCareerStrip"));
  ({ PlayerSeasonTable } = await import("../src/components/PlayerSeasonTable"));
  ({ PlayerExportCard } = await import("../src/components/PlayerExportCard"));
});
after(async () => {
  await (await import("../src/lib/db")).pool.end();
  await db?.stop();
});

test("NBA wording: since 2014-15, in every place a career was named", () => {
  const w = careerWording("nba", true);
  assert.equal(w.since, "2014-15");
  assert.equal(w.heroTitle, "Regular season since 2014-15");
  assert.equal(w.heroNote, "Games before 2014-15 are not on this site, so these are not career totals.");
  assert.equal(w.seasonTotal, "Total since 2014-15");
  assert.equal(w.playoffsTotal, "Playoffs since 2014-15");
  assert.equal(w.playinTotal, "Play-in since 2014-15");
  assert.equal(w.cardContext, "NBA stats since 2014-15");
  assert.equal(w.compareNote, "Totals since 2014-15");
  assert.equal(w.allSeasonsLabel("LeBron James"), "LeBron James, all seasons on this site");
});

test("NFL wording: since 2015, the season the box scores start", () => {
  const w = careerWording("nfl", true);
  assert.equal(w.since, "2015");
  assert.equal(w.heroTitle, "Regular season since 2015");
  assert.equal(w.heroNote, "Games before 2015 are not on this site, so these are not career totals.");
  assert.equal(w.cardContext, "NFL stats since 2015");
  assert.equal(w.seasonTotal, "Total since 2015");
});

test("soccer wording: each league's own first season, with no regular-season stage", () => {
  for (const league of ["epl", "laliga", "bundesliga", "seriea", "ucl"] as League[]) {
    const w = careerWording(league, false);
    assert.equal(w.since, "2015-16", league);
    assert.equal(w.heroTitle, "Since 2015-16", league);
    assert.equal(w.seasonTotal, "Total since 2015-16", league);
  }
  assert.equal(careerWording("epl", false).cardContext, "Premier League stats since 2015-16");
});

test("the strip says earlier seasons are missing only over several seasons, and only when the first is the first on the site", () => {
  assert.equal(careerStripSuffix("nba", 2015, true), " Earlier seasons are not on this site.");
  assert.equal(careerStripSuffix("nba", 2020, true), "");
  assert.equal(careerStripSuffix("nfl", 2015, true), " Earlier seasons are not on this site.");
  assert.equal(careerStripSuffix("nba", null, true), "");
  // A single-season page never says it.
  assert.equal(careerStripSuffix("nba", 2015, false), "");
});

test("the hero note that these are not career totals shows only for a player whose record starts where the site's does", () => {
  const note = "Games before 2014-15 are not on this site, so these are not career totals.";
  assert.equal(careerWording("nba", true, 2015).heroNote, note);
  // A 2019 rookie's whole career is on the site: nothing to disclose, and the header is still true.
  assert.equal(careerWording("nba", true, 2020).heroNote, null);
  assert.equal(careerWording("nba", true, 2020).heroTitle, "Regular season since 2014-15");
  assert.equal(careerWording("nba", true, null).heroNote, null);
  // Left out, the note is unconditional (callers that do not know the first season).
  assert.equal(careerWording("nba", true).heroNote, note);
  assert.equal(careerWording("nfl", true, 2015).heroNote, "Games before 2015 are not on this site, so these are not career totals.");
  assert.equal(careerWording("nfl", true, 2018).heroNote, null);
  assert.equal(careerWording("epl", false, 2015).heroNote, "Games before 2015-16 are not on this site, so these are not career totals.");
  assert.equal(careerWording("epl", false, 2019).heroNote, null);
});

test("cricket keeps its plain wording: its totals are whole careers, not 'since 2008'", () => {
  for (const league of ["ipl", "bbl", "cwc", "t20wc", "wpl", "wbbl", "wcwc", "wt20wc", "test", "odi", "t20i"] as League[]) {
    const w = careerWording(league, true);
    assert.equal(w.since, null, league);
    assert.equal(w.compareNote, "Career figures on record", league);
    assert.equal(w.seasonTotal, "Career on record", league);
    assert.equal(w.heroNote, null, league);
  }
});

function row(id: string, season: number, stats: Stats, stage: PlayerLogRow["stage"] = "regular"): PlayerLogRow {
  return {
    game_espn_id: id, date: `${season}-01-15`, season_year: season, round: null, week: null, stage, season_type: 2, competition_type: "STD",
    is_home: true, team_espn_id: "1", team_name: "Home", team_slug: "home", team_abbr: "HOM", team_logo: null,
    opponent_espn_id: "2", opponent_name: "Away", opponent_slug: "away", opponent_abbr: "AWY", opponent_logo: null,
    team_score: 100, opponent_score: 90, result: "W", stats,
  };
}
const nba = (id: string, season: number, stage: PlayerLogRow["stage"] = "regular") => row(id, season, { box: { MIN: "30", PTS: "20", REB: "5", AST: "4" } }, stage);
const nfl = (id: string, season: number) => row(id, season, { passing: { "C/ATT": "20/30", YDS: "250", TD: "2", INT: "1", RTG: "95.0" } });
const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);

test("the career strip reads 'NBA regular season, 2014-15 to 2025-26. Earlier seasons are not on this site.'", () => {
  const profile = buildStagedProfile("nba", [nba("a", 2015), nba("b", 2026)]).regular;
  const text = html(createElement(PlayerCareerStrip, { league: "nba", profile }));
  assert.match(text, /NBA regular season, 2014-15 to 2025-26\. Earlier seasons are not on this site\./);
  // A player whose first season on record is later has nothing missing to disclose.
  const rookie = buildStagedProfile("nba", [nba("c", 2020), nba("d", 2026)]).regular;
  const rookieText = html(createElement(PlayerCareerStrip, { league: "nba", profile: rookie }));
  assert.match(rookieText, /NBA regular season, 2019-20 to 2025-26\./);
  assert.doesNotMatch(rookieText, /Earlier seasons/);
});

test("a single-season page's strip (the season page) does not say earlier seasons are missing", () => {
  const only2015 = buildStagedProfile("nba", [nba("a", 2015), nba("b", 2015)]).regular;
  const text = html(createElement(PlayerCareerStrip, { league: "nba", profile: only2015 }));
  assert.match(text, /NBA regular season, 2014-15\./);
  assert.doesNotMatch(text, /Earlier seasons/);
});

test("the NFL career strip names the regular season and the first season on the site", () => {
  const profile = buildStagedProfile("nfl", [nfl("a", 2015), nfl("b", 2025)]).regular;
  const text = html(createElement(PlayerCareerStrip, { league: "nfl", profile }));
  assert.match(text, /NFL regular season, 2015 to 2025\. Earlier seasons are not on this site\./);
});

test("the soccer strip is not a regular season, and its first season is 2015-16", () => {
  const goal: Stats = { match: { APP: "1", SUBIN: "0", G: "1", A: "0", SHOT: "2", SOG: "1" } };
  const profile = buildStagedProfile("soccer", [row("s", 2015, goal), row("t", 2025, goal)]).regular;
  const text = html(createElement(PlayerCareerStrip, { league: "epl", profile }));
  assert.match(text, /Premier League, 2015-16 to 2025-26\. Earlier seasons are not on this site\./);
  assert.doesNotMatch(text, /regular season/);
});

test("the season table's totals row says 'Total since 2014-15' unless a caller names it", () => {
  const staged = buildStagedProfile("nba", [nba("a", 2015), nba("b", 2026), nba("p", 2026, "playoffs"), nba("q", 2015, "playoffs")]);
  const base = { league: "nba" as const, basePath: "/nba/players/x" };
  assert.match(html(createElement(PlayerSeasonTable, { ...base, profile: staged.regular })), /Total since 2014-15/);
  assert.match(html(createElement(PlayerSeasonTable, { ...base, profile: staged.playoffs!, careerLabel: careerWording("nba", true).playoffsTotal })), /Playoffs since 2014-15/);
  assert.doesNotMatch(html(createElement(PlayerSeasonTable, { ...base, profile: staged.regular })), /Career/);
});

test("the playoffs table renders ESPN's line for a season with no logged game (Butler 2014-15: 42.2 min, 22.9 ppg, the dagger on 12)", async () => {
  const { EspnSeasons, espnSeasonTotals } = await import("../src/lib/espnSeason");
  const post2015 = {
    postseason_averages: { labels: ["GP", "GS", "MIN", "FG", "FG%", "3PT", "3P%", "FT", "FT%", "OR", "DR", "REB", "AST", "BLK", "STL", "PF", "TO", "PTS"], values: ["12", "12", "42.2", "7.8-17.8", "44.1", "2.3-6.0", "38.9", "4.9-6.0", "81.9", "1.5", "4.1", "5.6", "3.2", "0.8", "2.4", "2.3", "1.8", "22.9"] },
    postseason_totals: { labels: ["FG", "FG%", "3PT", "3P%", "FT", "FT%", "OR", "DR", "REB", "AST", "BLK", "STL", "PF", "TO", "PTS"], values: ["94-213", "44.1", "28-72", "38.9", "59-72", "81.9", "18", "49", "67", "38", "9", "29", "27", "21", "275"] },
  };
  const line = espnSeasonTotals(post2015, "postseason_")!;
  const blank = Array.from({ length: 12 }, (_, i) => ({ ...nba(`b${i}`, 2015, "playoffs"), stats: { box: { MIN: "--", PTS: "0", REB: "0", AST: "0" } }, no_box_score: true }));
  const rows = [nba("r1", 2015), ...blank];
  const base = { league: "nba" as const, basePath: "/nba/players/x" };
  const withEspn = buildStagedProfile("nba", rows, undefined, new EspnSeasons([], [[2015, line]])).playoffs!;
  const text = html(createElement(PlayerSeasonTable, { ...base, profile: withEspn, careerLabel: careerWording("nba", true).playoffsTotal }));
  assert.match(text, /22\.9/);
  assert.match(text, /42\.2/);
  assert.match(text, /12†/);
  // Without the ESPN row the season shows dashes, never 0.0 or a partial average.
  const without = buildStagedProfile("nba", rows).playoffs!;
  const dashed = html(createElement(PlayerSeasonTable, { ...base, profile: without }));
  assert.doesNotMatch(dashed, /22\.9|42\.2|0\.0/);
  assert.match(dashed, /12†/);
});

test("the downloadable card says what its numbers cover", () => {
  const props = { league: "nba" as const, name: "X", headshotUrl: null, teamName: null, teamColor: null, meta: [], stats: [{ label: "GP", value: "1" }], boxOnlyShort: 0 };
  assert.match(html(createElement(PlayerExportCard, props)), /NBA stats since 2014-15/);
  assert.match(html(createElement(PlayerExportCard, { ...props, context: "2025-26 stats" })), /2025-26 stats/);
});

/** Every .ts and .tsx file under src. */
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sources(path) : /\.tsx?$/.test(name) ? [path] : [];
  });
}

test("no page or component still labels a partial total 'Career' (cricket's own note aside)", () => {
  const stale = ["Career (regular season)", "Career playoffs", "Career play-in", "Career on record", "Career figures on record", "Career stats", "Game Log & Career", "career stats"];
  const hits = sources(join(process.cwd(), "src")).flatMap((file) => {
    const text = readFileSync(file, "utf8");
    // playerCopy.ts keeps the plain wording for a league with no pinned start; compare.ts's is the cricket comparison, which has its own note.
    return file.endsWith("playerCopy.ts") || file.endsWith("compare.ts") ? [] : stale.filter((s) => text.includes(s)).map((s) => `${file}: ${s}`);
  });
  assert.deepEqual(hits, []);
});
