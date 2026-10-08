// Balls faced and boundaries ESPN never recorded (most Tests before 1980) are shown as "not recorded" or a dash,
// never as a zero or a total that looks complete beside a full runs total. Covers the career figures (full, partial
// and no coverage, against a real database), a scorecard with unrecorded innings, the centuries listing, the series
// totals, and the copy that is derived from TEST_ARCHIVE_START_YEAR.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { startTestDb, type TestDb } from "./helpers/testDb";
import { NOT_RECORDED, UNRECORDED_LEGEND, coverageOf, hasUnrecordedCells, maskUnrecorded, strikeRateTile } from "../src/lib/cricketRecorded";
import { extractCricketMatchStats } from "../scripts/lib/cricket-career";
import { parseCricketScorecard, type CricketTeamScorecard } from "../src/lib/matchDetail";
import { aggregateSeriesStats, type SeriesStatRow } from "../src/lib/cricketSeriesStats";
import { matchDidYouKnow, seriesDidYouKnow } from "../src/lib/cricketDidYouKnow";
import { topPerformers } from "../src/lib/cricketPerformers";
import { trunc2 } from "../src/lib/cricketFormat";
import {
  isFullTestHistory,
  testCareerCopy,
  testCenturiesDescription,
  testCenturiesIntro,
  testCenturiesSubtitle,
  testHubDescription,
  testHubIntro,
  testUnrecordedNote,
} from "../src/lib/testArchiveCopy";

let db: TestDb;
let queries: typeof import("../src/lib/queries");
before(async () => {
  db = await startTestDb();
  queries = await import("../src/lib/queries");
});
after(async () => {
  await (await import("../src/lib/db")).pool.end();
  await db?.stop();
});

/* ---------------------------------- career ---------------------------------- */

const inn = (n: number, runs: number, ballsFaced: number | null, fours: number | null = 0, sixes: number | null = 0) => ({ n, batting: { runs, ballsFaced, fours, sixes, notOut: false } });
async function addTest(game: string, player: string, innings: ReturnType<typeof inn>[]) {
  await db.pool.query(`insert into player_game_stats (league, game_espn_id, player_espn_id, team_espn_id, stats) values ('test', $1, $2, 'A', $3::jsonb)`, [game, player, JSON.stringify({ innings, v: 3 })]);
}

test("a career with every innings recorded: the strike rate is over all of them and nothing is flagged", async () => {
  await addTest("g1", "full", [inn(1, 100, 200), inn(2, 50, 100)]);
  const c = await queries.getPlayerCricketCareer("test", "full");
  assert.equal(c?.inningsBatted, 2);
  assert.equal(c?.inningsWithBalls, 2);
  assert.equal(c?.strikeRate, 50);
  assert.deepEqual(strikeRateTile(c!.strikeRate, c!.inningsWithBalls, c!.inningsBatted, trunc2), { value: "50.00", note: null });
});

test("a career with some innings recorded: the rate covers those, and says how many", async () => {
  await addTest("g1", "part", [inn(1, 40, 80)]);
  await addTest("g2", "part", [inn(1, 60, null, null, null)]);
  const c = await queries.getPlayerCricketCareer("test", "part");
  assert.equal(c?.runs, 100, "the runs total is every innings");
  assert.equal(c?.inningsBatted, 2);
  assert.equal(c?.inningsWithBalls, 1);
  assert.equal(c?.ballsFaced, 80);
  assert.equal(c?.strikeRate, 50, "40 off 80, not 100 off 80");
  assert.deepEqual(strikeRateTile(c!.strikeRate, c!.inningsWithBalls, c!.inningsBatted, trunc2), { value: "50.00", note: "over 1 of 2 innings" });
});

test("a career with no innings recorded has no strike rate and says so", async () => {
  await addTest("g1", "none", [inn(1, 80, null, null, null), inn(2, 12, null, null, null)]);
  const c = await queries.getPlayerCricketCareer("test", "none");
  assert.equal(c?.inningsBatted, 2);
  assert.equal(c?.inningsWithBalls, 0);
  assert.equal(c?.ballsFaced, 0);
  assert.equal(c?.strikeRate, null);
  assert.deepEqual(strikeRateTile(c!.strikeRate, c!.inningsWithBalls, c!.inningsBatted, trunc2), { value: NOT_RECORDED, note: null });
});

test("runs off no balls inside an otherwise recorded card are a gap, not an innings: they neither count nor inflate the rate", async () => {
  // The feed writes 0 for a batter it has no balls for: 30 off 0 balls would otherwise add 30 runs and no balls.
  await addTest("g1", "gap", [inn(1, 30, 0), inn(2, 20, 40), inn(3, 0, 0)]);
  const c = await queries.getPlayerCricketCareer("test", "gap");
  assert.equal(c?.inningsBatted, 3);
  assert.equal(c?.inningsWithBalls, 2, "the 20 off 40 and a genuine duck; not the 30 off 0");
  assert.equal(c?.ballsFaced, 40);
  assert.equal(c?.strikeRate, 50);
});

test("coverageOf: no innings at all is nothing to qualify", () => {
  assert.equal(coverageOf(0, 0), "full");
  assert.equal(coverageOf(0, 3), "none");
  assert.equal(coverageOf(2, 3), "partial");
  assert.equal(coverageOf(3, 3), "full");
});

async function renderCareer(id: string) {
  const { CricketCareer } = await import("../src/components/CricketCareer");
  const career = await queries.getPlayerCricketCareer("test", id);
  const splits = { team: [], opponent: [], venue: [] } as never;
  // The coverage note above the tiles says "not recorded" on purpose (pre-1980 scorecards); the assertions below are about the tiles.
  return renderToStaticMarkup(createElement(CricketCareer, { league: "test", career: career!, splits })).replace(/<p class="-mt-2 mb-3[^>]*>.*?<\/p>/, "");
}

test("the career panel: a full career shows the rate alone, a partial one 'over n of m innings', an unrecorded one 'not recorded'", async () => {
  const full = await renderCareer("full");
  assert.match(full, />50\.00<\/p>/);
  assert.doesNotMatch(full, /over \d+ of \d+ innings|not recorded/);

  const part = await renderCareer("part");
  assert.match(part, />50\.00<\/p>/);
  assert.match(part, /over 1 of 2 innings/);

  const none = await renderCareer("none");
  assert.match(none, />not recorded<\/p>[^]*?Strike Rate/);
  assert.doesNotMatch(none, />0\.00<\/p>|NaN|Infinity/);
  // Everything that is recorded stays: the runs total is still the full 92.
  assert.match(none, />92<\/p>/);
});

test("the comparison writes the same words beside a recorded career", async () => {
  const { cricketGroups } = await import("../src/lib/compare");
  const [full, none, part] = await Promise.all(["full", "none", "part"].map((id) => queries.getPlayerCricketCareer("test", id)));
  const sr = (a: typeof full, b: typeof full) => cricketGroups(a, b).flatMap((g) => g.metrics).find((m) => m.label === "Strike rate")!;
  assert.deepEqual([sr(full, none).aText, sr(full, none).bText], ["50.00", NOT_RECORDED]);
  assert.equal(sr(full, part).bText, "50.00 (over 1 of 2 innings)");
});

/* ------------------------------- single scorecards ------------------------------- */

const stat = (name: string, value: number) => ({ name, value, displayValue: String(value) });
function player(id: string, innings: number, order: number, runs: number, balls: number, fours: number, sixes: number) {
  return {
    athlete: { id, displayName: `Player ${id}` },
    linescores: [{ period: innings, statistics: { categories: [{ stats: [stat("batted", 1), stat("battingPosition", order), stat("runs", runs), stat("ballsFaced", balls), stat("fours", fours), stat("sixes", sixes), { name: "strikeRate", value: balls ? (runs * 100) / balls : 0, displayValue: balls ? ((runs * 100) / balls).toFixed(2) : "0.00" }] }] } }],
  };
}
// Team 1 batted first and nothing was recorded (a 1950s card); team 2's innings has balls and boundaries (a 1990s card).
const summary = {
  header: { competitions: [{ competitors: [] }] },
  rosters: [
    { team: { id: "1", displayName: "Australia" }, roster: [player("a", 1, 1, 120, 0, 0, 0), player("b", 1, 2, 45, 0, 0, 0)] },
    { team: { id: "2", displayName: "England" }, roster: [player("c", 2, 1, 70, 140, 8, 1), player("d", 2, 2, 15, 30, 1, 0)] },
  ],
};

test("a scorecard innings with no balls or boundaries recorded reads '-', not 0", () => {
  const [aus, eng] = parseCricketScorecard(summary);
  for (const row of aus.battingRows) assert.deepEqual(row.stats.slice(1), ["-", "-", "-", "-"], `${row.name}: B 4s 6s SR`);
  assert.deepEqual(aus.battingRows.map((r) => r.stats[0]), ["120", "45"], "the runs are still there");
  // The innings that was recorded is untouched, down to the strike rate text.
  assert.deepEqual(eng.battingRows[0].stats, ["70", "140", "8", "1", "50.00"]);
  assert.deepEqual(eng.battingRows[1].stats, ["15", "30", "1", "0", "50.00"]);
});

test("runs without balls inside a recorded innings are a dash for that batter only; a real zero boundary count stays 0", () => {
  const card = parseCricketScorecard({ ...summary, rosters: [{ team: { id: "2", displayName: "England" }, roster: [player("c", 2, 1, 70, 140, 8, 1), player("d", 2, 2, 22, 0, 0, 0), player("e", 2, 3, 6, 18, 0, 0)] }] });
  const [c, d, e] = card[0].battingRows;
  assert.equal(c.stats[1], "140");
  assert.deepEqual(d.stats.slice(1, 2).concat(d.stats[4]), ["-", "-"], "22 off no balls");
  assert.equal(d.stats[2], "0", "boundaries are recorded for the innings (9 of them), so this batter's 0 fours is real");
  assert.deepEqual(e.stats, ["6", "18", "0", "0", "33.33"]);
});

test("masking is idempotent, leaves a recorded card as the same object, and does not touch bowling", () => {
  const masked = maskUnrecorded(parseCricketScorecard(summary));
  assert.equal(maskUnrecorded(masked), masked);
  const recorded: CricketTeamScorecard[] = [parseCricketScorecard(summary)[1]];
  assert.equal(maskUnrecorded(recorded), recorded);
});

test("the legend is due exactly when a table has a dash in B, 4s, 6s or SR", () => {
  const [aus, eng] = parseCricketScorecard(summary);
  assert.equal(hasUnrecordedCells(aus.battingRows, aus.battingLabels), true);
  assert.equal(hasUnrecordedCells(eng.battingRows, eng.battingLabels), false);
});

test("a stored card from before the rule is shown with dashes and the legend, and a recorded one has neither", async () => {
  const { CricketScorecards } = await import("../src/components/CricketScorecard");
  const labels = ["R", "B", "4s", "6s", "SR"];
  const stored = (rows: string[][], teamId: string, teamName: string): CricketTeamScorecard => ({
    teamId, teamName, battingLabels: labels, battingRows: rows.map((stats, i) => ({ athleteId: `${teamId}${i}`, name: `P${teamId}${i}`, stats, innings: 1, position: i + 1, dismissal: "b X" })), bowlingLabels: ["O", "M", "R", "W", "Econ"], bowlingRows: [], innings: [{ period: 1, runs: 160, wickets: 10, overs: 80, description: "all out" }],
  });
  const old = renderToStaticMarkup(createElement(CricketScorecards, { league: "test", scorecard: [stored([["120", "0", "0", "0", "0.00"], ["40", "0", "0", "0", "0.00"]], "1", "Australia")], playerSlugs: new Map() }));
  assert.match(old, new RegExp(UNRECORDED_LEGEND.slice(0, 40)));
  assert.doesNotMatch(old, />0\.00</);
  assert.equal((old.match(/>-<\/span>|>-<\/td>/g) ?? []).length, 8, "2 batters x B, 4s, 6s, SR");
  const fresh = renderToStaticMarkup(createElement(CricketScorecards, { league: "test", scorecard: [stored([["70", "140", "8", "1", "50.00"]], "2", "England")], playerSlugs: new Map() }));
  assert.doesNotMatch(fresh, new RegExp(UNRECORDED_LEGEND.slice(0, 40)));
});

test("performers and did-you-know lines say nothing about balls or boundaries that were not recorded", () => {
  const card = parseCricketScorecard(summary);
  const { large } = topPerformers(card, null);
  assert.equal(large?.name, "Player a");
  assert.equal(large?.detail, "", "no '0 balls', no 'SR 0.00'");
  assert.deepEqual(matchDidYouKnow([card[0]]).filter((l) => /boundar/.test(l)), []);
  // One side recorded, the other not: a share of all the runs would be understated, so no boundary line at all.
  assert.deepEqual(matchDidYouKnow(card).filter((l) => /boundar/.test(l)), []);
});

test("the extractor stores a batter's runs off no balls as unrecorded, inside a recorded innings", () => {
  const ls = (period: number, s: Record<string, number>) => ({ period, statistics: { categories: [{ stats: Object.entries(s).map(([name, value]) => ({ name, value, displayValue: String(value) })) }] } });
  const out = extractCricketMatchStats({
    header: { competitions: [{ class: { generalClassCard: "Test" } }] },
    rosters: [{ team: { id: "1" }, roster: [
      { athlete: { id: "1", displayName: "One" }, starter: true, linescores: [ls(1, { batted: 1, runs: 60, ballsFaced: 100, fours: 5 })] },
      { athlete: { id: "2", displayName: "Two" }, starter: true, linescores: [ls(1, { batted: 1, runs: 25, ballsFaced: 0, fours: 2 })] },
    ] }],
  });
  const [one, two] = out.players;
  assert.equal(one.batting?.ballsFaced, 100);
  assert.equal(two.batting?.ballsFaced, null);
  assert.equal(two.batting?.runs, 25);
});

/* ---------------------------------- centuries ---------------------------------- */

test("the centuries list gives null, not 0, for balls and boundaries the scorers did not record", async () => {
  for (const [id, name] of [["A", "Australia"], ["E", "England"]]) await db.pool.query(`insert into teams (league, espn_id, name, slug) values ('test', $1, $2, $3)`, [id, name, name.toLowerCase()]);
  for (const [id, name] of [["bradman", "Don Bradman"], ["hutton", "Len Hutton"]]) await db.pool.query(`insert into players (league, espn_id, name, slug) values ('test', $1, $2, $3)`, [id, name, id]);
  const games: [string, string][] = [["h1930", "1930-07-11"], ["o1950", "1950-06-10"]];
  for (const [id, date] of games) await db.pool.query(`insert into games (league, espn_id, date, name, home_team_espn_id, away_team_espn_id, completed) values ('test', $1, $2, 'x', 'E', 'A', true)`, [id, date]);
  // Headingley 1930 is the one with balls (Bradman's 334 is the case that has them); the 1950 card has none.
  await db.pool.query(`insert into player_game_stats (league, game_espn_id, player_espn_id, team_espn_id, stats) values ('test', 'h1930', 'bradman', 'A', $1::jsonb)`, [JSON.stringify({ innings: [inn(1, 334, 448, 46, 0)], v: 3 })]);
  await db.pool.query(`insert into player_game_stats (league, game_espn_id, player_espn_id, team_espn_id, stats) values ('test', 'o1950', 'hutton', 'E', $1::jsonb)`, [JSON.stringify({ innings: [inn(1, 130, null, null, null)], v: 3 })]);
  // And the feed's own zeros, stored before the null rule: 0 balls and no boundaries for a hundred.
  await db.pool.query(`insert into games (league, espn_id, date, name, home_team_espn_id, away_team_espn_id, completed) values ('test', 'z1', '1940-01-01', 'x', 'E', 'A', true)`);
  await db.pool.query(`insert into player_game_stats (league, game_espn_id, player_espn_id, team_espn_id, stats) values ('test', 'z1', 'hutton', 'E', $1::jsonb)`, [JSON.stringify({ innings: [inn(1, 101, 0, 0, 0)], v: 2 })]);

  const rows = await queries.getCricketCenturies("test");
  const by = (name: string, runs: number) => rows.find((r) => r.player_name === name && r.runs === runs)!;
  assert.deepEqual([by("Don Bradman", 334).balls_faced, by("Don Bradman", 334).fours, by("Don Bradman", 334).sixes], [448, 46, 0]);
  const gap = by("Len Hutton", 130);
  assert.deepEqual([gap.balls_faced, gap.fours, gap.sixes], [null, null, null]);
  const zeros = by("Len Hutton", 101);
  assert.deepEqual([zeros.balls_faced, zeros.fours, zeros.sixes], [null, null, null], "the feed's zeros are not figures");

  const { CenturiesExportCard } = await import("../src/components/CenturiesExportCard");
  const html = renderToStaticMarkup(createElement(CenturiesExportCard, { league: "test", centuries: rows, title: "Test centuries", subtitle: "x" }));
  assert.match(html, new RegExp(UNRECORDED_LEGEND.slice(0, 40)));
  assert.equal((html.match(/>-</g) ?? []).length, 8, "two centuries x balls, 4s, 6s, SR; Bradman's recorded 0 sixes stays 0");
  const onlyRecorded = renderToStaticMarkup(createElement(CenturiesExportCard, { league: "test", centuries: [by("Don Bradman", 334)], title: "t", subtitle: "x" }));
  assert.doesNotMatch(onlyRecorded, new RegExp(UNRECORDED_LEGEND.slice(0, 40)));
});

/* ----------------------------------- series ----------------------------------- */

const seriesRow = (match: string, player: string, name: string, batting: { runs: number; ballsFaced: number | null; fours: number | null; sixes: number | null }): SeriesStatRow => ({
  match_espn_id: match, stage: null, player_espn_id: player, player_name: name, team_espn_id: "10", stats: { batting: { ...batting, notOut: false } },
});

test("a series whose boundaries are recorded for only some innings states no boundary totals and no 'most sixes'", () => {
  const partial = aggregateSeriesStats([
    seriesRow("m1", "p1", "Eve Alpha", { runs: 30, ballsFaced: 20, fours: 2, sixes: 4 }),
    seriesRow("m2", "p2", "Dee Bravo", { runs: 50, ballsFaced: null, fours: null, sixes: null }),
  ]);
  assert.equal(partial.totals.hasBoundaries, false);
  assert.equal(partial.mostSixes, null);
  assert.deepEqual(seriesDidYouKnow(partial), []);
  assert.equal(partial.batting.find((b) => b.name === "Dee Bravo")?.strikeRate, null, "the leaders table shows a dash for an unrecorded innings");
  assert.equal(partial.batting.find((b) => b.name === "Eve Alpha")?.strikeRate, 150);
  const all = aggregateSeriesStats([
    seriesRow("m1", "p1", "Eve Alpha", { runs: 30, ballsFaced: 20, fours: 2, sixes: 4 }),
    seriesRow("m2", "p2", "Dee Bravo", { runs: 50, ballsFaced: 40, fours: 1, sixes: 1 }),
  ]);
  assert.equal(all.totals.hasBoundaries, true);
  assert.equal(all.mostSixes?.name, "Eve Alpha");
});

test("the series leaders table explains a dash under SR, and only then", async () => {
  const { CricketSeriesLeaders } = await import("../src/components/CricketSeriesLeaders");
  const teams = [{ id: "10", name: "Alpha", abbreviation: "ALP" }];
  const dash = aggregateSeriesStats([seriesRow("m1", "p2", "Dee Bravo", { runs: 50, ballsFaced: null, fours: null, sixes: null }), seriesRow("m2", "p2", "Dee Bravo", { runs: 5, ballsFaced: 9, fours: 0, sixes: 0 })]);
  assert.match(renderToStaticMarkup(createElement(CricketSeriesLeaders, { stats: dash, teams })), /A dash under SR means balls faced were not recorded/);
  const fine = aggregateSeriesStats([seriesRow("m1", "p2", "Dee Bravo", { runs: 50, ballsFaced: 30, fours: 5, sixes: 1 })]);
  assert.doesNotMatch(renderToStaticMarkup(createElement(CricketSeriesLeaders, { stats: fine, teams })), /A dash under SR/);
});

/* ------------------------------------ copy ------------------------------------ */

test("the copy derives from the archive start: the wording production shows today (2015) is unchanged", () => {
  assert.equal(testHubDescription(2015), "Latest Test match results with full four-innings scorecards, and every men's Test since 2015.");
  assert.equal(testHubIntro(2015), "Every men's Test since the start of 2015, with new results added daily: completed matches only. A Test in progress is on the cricket series pages.");
  assert.equal(testCenturiesDescription(2015), "Every Test century since 2015, most recent first, with balls faced, boundaries, opponent and ground.");
  assert.equal(testCenturiesIntro("All 12", 2015), "All 12 Test centuries since the start of 2015, newest first.");
  assert.equal(testCenturiesSubtitle("All 12", 2015), "All 12 Test centuries since the start of 2015, newest first");
  assert.equal(testCareerCopy(2015), "Counts the men's Tests held on this site: every Test since the start of 2015. Tests before 2015 are not included, so totals for anyone who played earlier are lower than Cricinfo's. Average, highest score, hundreds and five-wicket hauls are counted per innings.");
  for (const text of [testHubIntro(2015), testCenturiesIntro("All 1", 2015), testCareerCopy(2015), testCenturiesDescription(2015)]) assert.doesNotMatch(text, /not recorded/);
  assert.equal(testUnrecordedNote(2015), null);
  assert.equal(testUnrecordedNote(1980), null);
});

test("with the full history every string says 1877 and the 'not recorded before 1980' sentence appears", () => {
  const note = "Balls faced and boundaries were not recorded for many matches before 1980.";
  assert.equal(isFullTestHistory(1877), true);
  assert.equal(testUnrecordedNote(1877), note);
  assert.equal(testHubDescription(1877), "Latest Test match results with full four-innings scorecards, and every men's Test since 1877.");
  assert.equal(testHubIntro(1877), `Every men's Test since 1877, with new results added daily: completed matches only. A Test in progress is on the cricket series pages. ${note}`);
  assert.equal(testCenturiesIntro("All 12", 1877), `All 12 Test centuries since 1877, newest first. ${note}`);
  assert.equal(testCenturiesSubtitle("All 12", 1877), "All 12 Test centuries since 1877, newest first");
  assert.match(testCenturiesDescription(1877), /^Every Test century since 1877, .*balls faced and boundaries where the scorers recorded them\.$/);
  const careerNote = testCareerCopy(1877);
  assert.match(careerNote, /every Test since 1877\./);
  assert.ok(careerNote.includes(note));
  assert.match(careerNote, /Strike rate counts only the innings where balls faced were recorded/);
  assert.doesNotMatch(careerNote, /are not included|2015/);
  // A partial archive that starts before 1980 says the sentence and still says what it leaves out.
  assert.ok(testCareerCopy(1950).includes(note));
  assert.match(testCareerCopy(1950), /Tests before 1950 are not included/);
});

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

test("no page or component hard-codes where the Test archive starts: the only year is the constant", () => {
  // A Test line that names a literal year after since/from/before, or an archive start of 2015, is a string the
  // constant can no longer move. Template literals that interpolate the constant (or call testArchiveCopy) are fine.
  const offenders: string[] = [];
  for (const file of sourceFiles(join(process.cwd(), "src"))) {
    if (file.endsWith("testArchiveCopy.ts") || file.includes("/content/")) continue;
    readFileSync(file, "utf8").split("\n").forEach((line, i) => {
      if (/\/\/|^\s*\*/.test(line.trim().slice(0, 2))) return; // comments
      if (/\bTests?\b[^`"']*\b(since|from|before)\b[^`"']*\b(19|20)\d\d\b/i.test(line) && !/ODI|T20|women|Women|\$\{/.test(line)) offenders.push(`${file}:${i + 1}: ${line.trim()}`);
      if (/\bTest\b.{0,60}\b(since|from)\b the start of 20\d\d/i.test(line)) offenders.push(`${file}:${i + 1}: ${line.trim()}`);
    });
  }
  assert.deepEqual(offenders, []);
  // And the five pages that state it read the derived copy.
  const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
  assert.match(read("src/lib/cricketCareerNote.ts"), /testCareerCopy\(\)/);
  assert.match(read("src/app/[league]/page.tsx"), /testHubDescription\(\)/);
  assert.match(read("src/app/[league]/page.tsx"), /testHubIntro\(\)/);
  assert.match(read("src/app/[league]/centuries/page.tsx"), /testCenturiesDescription\(\)/);
  assert.match(read("src/app/[league]/centuries/page.tsx"), /testCenturiesIntro\(count\)/);
  assert.match(read("src/app/[league]/centuries/page.tsx"), /testCenturiesSubtitle\(count\)/);
});
