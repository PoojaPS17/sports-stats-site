// A cricket archive that starts after the format did must say so wherever a player's totals appear: the comparison,
// the meta descriptions, and the formats strip. The years are read from one place, so flipping the Test archive to
// 1877 changes the words and removes the warnings by itself.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { startTestDb, type TestDb } from "./helpers/testDb";
import {
  archiveColumnLabel,
  archiveIsPartial,
  archiveScope,
  archiveStartYear,
  careerMayBeIncomplete,
  compareCoverageLine,
  comparePartialWarning,
  cricketFormatNote,
  missingFormatNote,
} from "../src/lib/cricketCoverage";
import { FIRST_TEST_YEAR, TEST_ARCHIVE_START_YEAR, formatSeasonLabel } from "../src/lib/leagues";
import { testHubDescription, testsSince } from "../src/lib/testArchiveCopy";
import { h2hSince } from "../src/lib/h2h";
import { cricketPlayerDescription } from "../src/lib/cricketPlayerSeo";
import { cricketCareerNote } from "../src/lib/cricketCareerNote";
import type { CricketCareerStats } from "../src/lib/queries";

let db: TestDb;
let queries: typeof import("../src/lib/queries");
let compare: typeof import("../src/lib/compare");

before(async () => {
  db = await startTestDb();
  queries = await import("../src/lib/queries");
  compare = await import("../src/lib/compare");
  const q = (sql: string, params: unknown[] = []) => db.pool.query(sql, params);
  await q(`insert into players (league, espn_id, name, slug) values
    ('odi', 'old', 'Old Hand', 'old-hand'), ('t20i', 'old', 'Old Hand', 'old-hand'),
    ('odi', 'new', 'New Cap', 'new-cap'), ('odi', 'mid', 'Mid Hand', 'mid-hand'),
    ('test', 'tst', 'Test Man', 'test-man'), ('odi', 'tst', 'Test Man', 'test-man')`);
  const game = (league: string, id: string, date: string) =>
    q(`insert into games (league, espn_id, date, name, home_team_espn_id, away_team_espn_id, completed) values ($1, $2, $3, 'x', 'h', 'a', true)`, [league, id, date]);
  const row = (league: string, game_id: string, player: string, runs: number) =>
    q(`insert into player_game_stats (league, game_espn_id, player_espn_id, team_espn_id, stats) values ($1, $2, $3, 'x', $4)`, [league, game_id, player, JSON.stringify({ innings: [{ batting: { runs } }] })]);
  await game("odi", "g1", "2003-05-01T10:00:00Z");
  await game("odi", "g2", "2012-05-01T10:00:00Z");
  await game("odi", "g3", "2019-05-01T10:00:00Z");
  await game("t20i", "g4", "2007-09-01T10:00:00Z");
  await game("test", "g5", "2016-01-01T10:00:00Z");
  await game("odi", "g6", "2008-12-31T23:30:00Z");
  await row("odi", "g1", "old", 40);
  await row("odi", "g2", "old", 60);
  await row("t20i", "g4", "old", 30);
  await row("odi", "g3", "new", 100);
  await row("odi", "g2", "mid", 10);
  await row("odi", "g6", "tst", 5);
  await row("test", "g5", "tst", 5);
});
after(async () => {
  await (await import("../src/lib/db")).pool.end();
  await db?.stop();
});

const career = (over: Partial<CricketCareerStats> = {}): CricketCareerStats => ({
  matches: 146, inningsBatted: 144, runs: 6433, ballsFaced: 7000, inningsWithBalls: 144, notOuts: 10, hundreds: 16, fifties: 37, highestScore: 200, highestScoreNotOut: false,
  average: 48.01, strikeRate: 86.76, inningsBowled: 5, overs: 20, runsConceded: 100, wickets: 3, economy: 5, fiveWicketHauls: 0, catches: 4, ...over,
});

/* ---------------------------------- the rules ---------------------------------- */

test("scope is stated for every partial archive, and only while it is partial", () => {
  assert.equal(archiveScope("test", 2015), "since 2015");
  assert.equal(archiveScope("test"), null, "the live archive is every Test, so no scope");
  assert.equal(archiveScope("odi"), "since 2002");
  assert.equal(archiveScope("wodi"), "since 2009");
  assert.equal(archiveScope("wt20i"), "since 2009");
  // the men's T20I archive starts with the first T20I ever played: nothing is left out
  assert.equal(archiveScope("t20i"), null);
  assert.equal(archiveScope("ipl"), null);
  assert.equal(archiveScope("test", 1877), null);
  assert.equal(archiveColumnLabel("odi"), "ODIs since 2002");
  assert.equal(archiveColumnLabel("test", 1877), null);
});

test("a career may be incomplete when its first stored match is in the archive's first dense year or before", () => {
  assert.equal(careerMayBeIncomplete("test", 2015, 2015), true);
  assert.equal(careerMayBeIncomplete("test", 2016, 2015), false);
  assert.equal(careerMayBeIncomplete("odi", 2003), true);
  assert.equal(careerMayBeIncomplete("odi", 2009), true);
  assert.equal(careerMayBeIncomplete("odi", 2010), false);
  assert.equal(careerMayBeIncomplete("test", null), false);
  assert.equal(careerMayBeIncomplete("ipl", 2008), false);
  assert.equal(careerMayBeIncomplete("t20i", 2005), false);
  // the full Test history is loaded: no career is partial
  assert.equal(careerMayBeIncomplete("test", 1877, 1877), false);
  assert.equal(careerMayBeIncomplete("test", 2015, 1877), false);
});

test("the warning names who, and is silent when nobody is partial", () => {
  assert.equal(comparePartialWarning("odi", []), null);
  assert.match(comparePartialWarning("odi", ["Sachin Tendulkar"])!, /^Partial comparison: Sachin Tendulkar's career may have begun before our ODIs archive does \(since 2002\)/);
  assert.match(comparePartialWarning("test", ["A B", "C D"], 2015)!, /A B's and C D's careers .*\(since 2015\), so those totals are lower/);
  assert.equal(comparePartialWarning("test", ["A B"], 1877), null);
  assert.equal(compareCoverageLine("test", 1877), null);
  assert.match(compareCoverageLine("test", 2015)!, /Tests held on this site, since 2015\. Matches before then are not included\./);
});

test("flipping the Test archive to 1877 leaves no 2015 in the Test words", () => {
  assert.doesNotMatch(cricketPlayerDescription("test", "A B", "India", career(), 1877), /since/);
  assert.match(cricketPlayerDescription("test", "A B", "India", career(), 2015), /^A B Test Cricket stats since 2015: 146 matches/);
  assert.equal(missingFormatNote("A B", "odi", 2004, ["odi"], 1877), null);
});

test("the live Test archive starts at the first Test ever played, and a 1877 season resolves", () => {
  assert.equal(TEST_ARCHIVE_START_YEAR, 1877);
  assert.equal(TEST_ARCHIVE_START_YEAR, FIRST_TEST_YEAR);
  assert.equal(archiveIsPartial("test"), false);
  assert.equal(archiveStartYear("test"), null);
  assert.equal(testsSince(), "since 1877");
  assert.equal(formatSeasonLabel("test", 1877), "1877");
  assert.match(testHubDescription(), /every men's Test since 1877\./);
  assert.doesNotMatch(cricketCareerNote("test"), /2015|Tests before/);
  assert.equal(h2hSince("test", 1877), "since 1877");
});

/* ------------------------------- meta descriptions ------------------------------- */

test("a partial archive's description carries its scope; a domestic league's does not", () => {
  const odi = cricketPlayerDescription("odi", "Sachin Tendulkar", "India", career());
  assert.match(odi, /^Sachin Tendulkar ODI Internationals stats since 2002: 146 matches, 6,433 runs/);
  assert.ok(odi.length <= 160, odi);
  assert.match(cricketPlayerDescription("wodi", "Mithali Raj", "India", career()), /stats since 2009: 146 matches/);
  assert.match(cricketPlayerDescription("test", "Alastair Cook", "England", career({ matches: 52 }), 2015), /Test Cricket stats since 2015: 52 matches/);
  assert.equal(
    cricketPlayerDescription("ipl", "Virat Kohli", "RCB", career({ matches: 252, runs: 8004 })),
    "Virat Kohli IPL stats: 252 matches, 8,004 runs at 48.01 with 16 hundreds and 37 fifties, best 200, for RCB. Match log and splits."
  );
  // the scope survives the shortening for a very long name
  const long = cricketPlayerDescription("test", "Alyssa Jane Healy-Starc Longname", "Sydney Sixers Women Cricket Club", career(), 2015);
  assert.ok(long.length <= 160, `${long.length}`);
  assert.match(long, /since 2015/);
});

test("the ODI note states the real archive start and the 2009 line, without percentages", () => {
  const note = cricketCareerNote("odi");
  assert.match(note, /Coverage begins in 2002 and is incomplete until 2009/);
  assert.match(note, /lower than Cricinfo's for anyone who played before 2009/);
  assert.doesNotMatch(note, /\d+%/);
});

/* ------------------------------------ the data ------------------------------------ */

test("first stored years per competition, in UTC", async () => {
  assert.deepEqual(await queries.getPlayerFirstStoredYears("old"), { odi: 2003, t20i: 2007 });
  assert.deepEqual(await queries.getPlayerFirstStoredYears("tst"), { odi: 2008, test: 2016 });
  assert.deepEqual(await queries.getPlayerFirstStoredYears("nobody"), {});
});

test("the comparison flags the long careers, labels both columns and marks nothing better", async () => {
  const c = await compare.getPlayerComparison("odi", "old-hand", "new-cap");
  assert.ok(c?.coverage);
  assert.equal(c.coverage.label, "ODIs since 2002");
  assert.equal(c.coverage.partialA, true);
  assert.equal(c.coverage.partialB, false);
  assert.match(c.coverage.warning!, /Old Hand's career may have begun before/);
  assert.doesNotMatch(c.coverage.warning!, /New Cap/);
  assert.match(c.groups[0].note!, /Coverage begins in 2002/);
  assert.equal(c.groups[0].title, "Career on this site");
});

test("two careers that began after the dense years get the coverage line but no warning", async () => {
  const c = await compare.getPlayerComparison("odi", "mid-hand", "new-cap");
  assert.equal(c?.coverage?.warning, null);
  assert.match(c!.coverage!.line!, /ODIs held on this site, since 2002/);
  assert.equal(c!.coverage!.partialA, false);
});

test("a league with no gap has no label, line or warning", () => {
  const cov = compare.compareCoverage("ipl", "A", "B", 2008, 2008);
  assert.deepEqual(cov, { label: null, line: null, warning: null, partialA: false, partialB: false });
  assert.equal(compare.compareCoverage("test", "A", "B", 2015, 2015, 1877).warning, null);
});

test("the table marks no better figure and draws no bars when told the comparison is partial", async () => {
  const { CompareTable } = await import("../src/components/CompareTable");
  const groups = compare.cricketGroups(career(), career({ runs: 15109, matches: 317 }), "odi");
  const props = { groups, colorA: null, colorB: null, nameA: "A", nameB: "B" };
  const normal = renderToStaticMarkup(createElement(CompareTable, props));
  const neutral = renderToStaticMarkup(createElement(CompareTable, { ...props, neutral: true }));
  assert.match(normal, /font-bold text-\[var\(--text\)\]/);
  assert.doesNotMatch(neutral, /font-bold text-\[var\(--text\)\]/);
  assert.doesNotMatch(neutral, /rounded-full bg-\[var\(--surface-muted\)\]/);
  assert.match(neutral, /15109/);
});

/* ------------------------------ the formats strip note ------------------------------ */

test("a long ODI career with no Test page gets the note; a recent one, or one with Tests, does not", async () => {
  const note = async (league: "odi" | "test" | "t20i", id: string, name: string, others: Awaited<ReturnType<typeof queries.getPlayerOtherFormats>>) =>
    cricketFormatNote(name, league, await queries.getPlayerFirstStoredYears(id), others.map((o) => o.league), 2015);
  const oldOthers = await queries.getPlayerOtherFormats("odi", "old");
  assert.deepEqual(oldOthers.map((o) => o.league), ["t20i"]);
  assert.equal(
    await note("odi", "old", "Old Hand", oldOthers),
    "Tests before 2015 are not on this site yet, so there is no Tests page for Old Hand. Any played earlier are missing."
  );
  // began in 2019: any Test he played would be in the archive, so it has nothing to apologise for
  assert.equal(await note("odi", "new", "New Cap", []), null);
  // has a Test row: no note
  assert.equal(await note("odi", "tst", "Test Man", await queries.getPlayerOtherFormats("odi", "tst")), null);
  // the T20I page of the same man gets it too
  assert.match((await note("t20i", "old", "Old Hand", await queries.getPlayerOtherFormats("t20i", "old")))!, /^Tests before 2015/);
  // a person with no stored international match gets nothing
  assert.equal(cricketFormatNote("Nobody", "ipl", {}, []), null);
  // a domestic-only person, and a women's page, never get a men's Tests note
  assert.equal(cricketFormatNote("W", "wodi", { wodi: 2010 }, []), null);
  assert.equal(cricketFormatNote("D", "ipl", { ipl: 2008 }, []), null);
});

test("the strip renders the note with or without chips, and nothing when there is neither", async () => {
  const { CricketOtherFormats } = await import("../src/components/CricketOtherFormats");
  const html = renderToStaticMarkup(createElement(CricketOtherFormats, { name: "Old Hand", formats: [], note: "Tests before 2015 are not on this site yet." }));
  assert.match(html, /Tests before 2015 are not on this site yet\./);
  assert.equal(renderToStaticMarkup(createElement(CricketOtherFormats, { name: "Old Hand", formats: [] })), "");
});
