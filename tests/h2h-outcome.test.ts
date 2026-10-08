import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { startTestDb, type TestDb } from "./helpers/testDb";
import { cricketResult, currentRun, meetingResult, recordedResultNote, tallyMeetings, winnerFromSummary, type OutcomeGame } from "../src/lib/h2hOutcome";
import { h2hDescription, h2hOtherResults, h2hRecord, h2hSince } from "../src/lib/h2h";
// rivalry.ts imports analytics, which builds the database pool when first loaded: only after startTestDb.
let rivalryMeter: typeof import("../src/lib/rivalry").rivalryMeter;
import { TEST_ARCHIVE_START_YEAR } from "../src/lib/leagues";
import { testsSince } from "../src/lib/testArchiveCopy";

// The rows below are real: games and teams read from production on 2026-10-08 (ESPN's own result lines and flags).
// A cricket score on file is a side's first innings (Tests) or one match total, so the old rule (more runs
// wins, level is a draw) counted 61 of 63 drawn Tests as wins, and flipped DLS, tied and abandoned matches.

const g = (o: Partial<OutcomeGame> & Pick<OutcomeGame, "status_summary">): OutcomeGame => ({
  home_team_espn_id: "1",
  away_team_espn_id: "2",
  home_score: 100,
  away_score: 90,
  home_winner: null,
  away_winner: null,
  home_name: "England",
  home_abbr: "ENG",
  away_name: "India",
  away_abbr: "IND",
  ...o,
});

test("a drawn Test is a draw whatever the first-innings scores say", () => {
  // England v India, 2025-07-23: 669 and 358 on file, "Match drawn", neither side flagged.
  assert.equal(cricketResult(g({ status_summary: "Match drawn", home_score: 669, away_score: 358 })), "draw");
  // 2016-11-09 at Rajkot: 488 against 537, drawn.
  assert.equal(meetingResult("test", g({ status_summary: "Match drawn", home_score: 488, away_score: 537 }), "1"), "draw");
});

test("the lower first innings can win a Test: the flag and the line decide, not the scores", () => {
  // 2024-01-25 Hyderabad: India 436 against England 246, England won by 28 runs.
  const hyd = g({ home_name: "India", home_abbr: "IND", away_name: "England", away_abbr: "ENG", home_team_espn_id: "6", away_team_espn_id: "1", home_score: 436, away_score: 246, home_winner: false, away_winner: true, status_summary: "England won by 28 runs" });
  assert.equal(meetingResult("test", hyd, "1"), "A");
  assert.equal(meetingResult("test", hyd, "6"), "B");
  // The flags alone decide when the line does not name the team ("Stars" is Melbourne Stars).
  const bbl = g({ home_name: "Melbourne Stars", home_abbr: "MS", away_name: "Sydney Sixers", away_abbr: "SS", home_winner: true, away_winner: false, status_summary: "Stars won by 5 wkts (4b rem)" });
  assert.equal(cricketResult(bbl), "home");
});

test("the result line beats a flag worked out from the scores when DLS reverses the match", () => {
  // Netherlands Women 90/2 chasing 70 beat the USA's 129/7 by DLS; the stored flag went to the higher score.
  const dls = g({ home_name: "Netherlands Women", home_abbr: "NL-W", away_name: "United States of America Women", away_abbr: "USA-W", home_score: 90, away_score: 129, home_winner: false, away_winner: true, status_summary: "NL Women won by 21 runs (DLS)" });
  assert.equal(winnerFromSummary(dls), "home");
  assert.equal(cricketResult(dls), "home");
});

test("ties, super overs, no results and abandoned matches are not wins", () => {
  assert.equal(cricketResult(g({ status_summary: "Match tied (United States of America won the Super Over)", home_winner: false, away_winner: true })), "tie");
  assert.equal(cricketResult(g({ status_summary: "Match tied (DLS method)" })), "tie");
  assert.equal(cricketResult(g({ status_summary: "No result" })), "noResult");
  assert.equal(cricketResult(g({ status_summary: "No result (abandoned with a toss)" })), "noResult");
  assert.equal(cricketResult(g({ status_summary: "Match cancelled without a ball bowled" })), "noResult");
});

test("an unmatched or ambiguous team name is unknown, never guessed", () => {
  // Malaysia is "MAS" in the line and "MAL-W" in the team row; Swaziland is Eswatini.
  const mas = g({ home_name: "Malaysia Women", home_abbr: "MAL-W", away_name: "Singapore Women", away_abbr: "SIN-W", status_summary: "MAS Women won by 22 runs" });
  assert.equal(cricketResult(mas), "unknown");
  assert.equal(cricketResult(g({ status_summary: null })), "unknown");
  assert.equal(cricketResult(g({ status_summary: "Result awaited" })), "unknown");
  // "AUS" fits both Australia and Austria: ambiguous when the two meet.
  const aus = g({ home_name: "Australia", home_abbr: "AUS", away_name: "Austria", away_abbr: "AUT", status_summary: "AUS won by 5 wkts" });
  assert.equal(cricketResult(aus), "unknown");
  // Both flags set is a data fault, not a result.
  assert.equal(cricketResult(g({ status_summary: null, home_winner: true, away_winner: true })), "unknown");
});

test("abbreviations and dotted forms in the line match the right team", () => {
  const png = g({ home_name: "Hong Kong", home_abbr: "HKG", away_name: "Papua New Guinea", away_abbr: "PNG", status_summary: "P.N.G. won by 3 wkts (4b rem)" });
  assert.equal(winnerFromSummary(png), "away");
  const uae = g({ home_name: "Netherlands", home_abbr: "NED", away_name: "United Arab Emirates", away_abbr: "UAE", status_summary: "U.A.E. won by 13 runs" });
  assert.equal(winnerFromSummary(uae), "away");
  const cay = g({ home_name: "Cayman Islands", home_abbr: "CAY", away_name: "Bahamas", away_abbr: "BHM", status_summary: "Cayman won by 15 runs" });
  assert.equal(winnerFromSummary(cay), "home");
  const wi = g({ home_name: "Pakistan Women", home_abbr: "PAK-W", away_name: "West Indies Women", away_abbr: "WI-W", status_summary: "WI Women won by 12 runs" });
  assert.equal(winnerFromSummary(wi), "away");
});

test("football, NFL and NBA still count from the score", () => {
  const row = (home: number, away: number): OutcomeGame => g({ home_score: home, away_score: away, status_summary: null });
  // Football: level is a draw.
  assert.equal(meetingResult("epl", row(1, 1), "1"), "draw");
  assert.equal(meetingResult("epl", row(2, 0), "2"), "B");
  // NFL: a tie is the draw bucket; NBA never ties.
  assert.equal(meetingResult("nfl", row(20, 20), "1"), "draw");
  assert.equal(meetingResult("nba", row(101, 99), "1"), "A");
  // A flag that disagrees with the score is ignored outside cricket (a shoot-out winner does not turn a draw into a win).
  assert.equal(meetingResult("ucl", g({ home_score: 1, away_score: 1, home_winner: true, away_winner: false, status_summary: "Arsenal won 4-2 on penalties" }), "1"), "draw");
  const t = tallyMeetings("epl", [row(1, 1), row(3, 0), row(0, 2), row(2, 2)], "1");
  assert.deepEqual(t, { meetings: 4, winsA: 1, winsB: 1, draws: 2, ties: 0, noResults: 0, unknown: 0 });
});

test("the tally separates wins, draws, ties, no results and unknowns, and they add up", () => {
  const rows = [
    g({ status_summary: "England won by 5 wkts" }),
    g({ status_summary: "India won by 6 runs" }),
    g({ status_summary: "Match drawn" }),
    g({ status_summary: "Match tied" }),
    g({ status_summary: "No result" }),
    g({ status_summary: null }),
  ];
  const t = tallyMeetings("test", rows, "1");
  assert.deepEqual(t, { meetings: 6, winsA: 1, winsB: 1, draws: 1, ties: 1, noResults: 1, unknown: 1 });
  assert.equal(t.winsA + t.winsB + t.draws + t.ties + t.noResults + t.unknown, t.meetings);
  assert.equal(recordedResultNote(t), "Results are recorded for 5 of 6 meetings; the other is left out of the record.");
  assert.equal(recordedResultNote({ meetings: 6, unknown: 0 }), null);
});

test("the current run is the newest meeting's winner, and unknown, tied or abandoned ends it", () => {
  assert.deepEqual(currentRun(["A", "A", "B", "A"]), { team: "A", length: 2 });
  assert.deepEqual(currentRun(["draw", "draw", "A"]), { team: null, length: 2 });
  assert.equal(currentRun(["unknown", "A", "A"]), null);
  assert.equal(currentRun(["tie", "A"]), null);
  assert.equal(currentRun(["noResult", "A"]), null);
  assert.equal(currentRun([]), null);
  // A gap in the data stops a run rather than hiding inside it.
  assert.deepEqual(currentRun(["B", "B", "unknown", "B"]), { team: "B", length: 2 });
});

test("the rivalry meter reads cricket results, shows ties and no results and skips unknowns", () => {
  const A = { espn_id: "1", name: "England", slug: "england", abbreviation: "ENG", logo_url: null, color: null };
  const B = { espn_id: "2", name: "India", slug: "india", abbreviation: "IND", logo_url: null, color: null };
  const game = (summary: string | null, scores: [number, number]): never => ({ ...g({ status_summary: summary, home_score: scores[0], away_score: scores[1] }), completed: true, stage: null }) as never;
  // Newest first. The first-innings scores point the wrong way on purpose.
  const games = [game("Match drawn", [669, 358]), game(null, [10, 20]), game("India won by 6 runs", [247, 224]), game("England won by 22 runs", [387, 387]), game("Match tied", [5, 5]), game("No result", [1, 0]), game("England won by 5 wkts", [1, 2])];
  const m = rivalryMeter({ teamA: A, teamB: B, winsA: 2, winsB: 1, meetings: 7, unknown: 1, league: "test", games }, (t) => t.name);
  assert.deepEqual(m.last5, ["D", "B", "A", "T", "N"]);
  // Six meetings with a result: the label reads the 2-1 record.
  assert.equal(m.label, "Clear edge to England");
});

test("the wording says what the record counts and never 'all-time'", () => {
  const t = { league: "test" as const, meetings: 29, winsA: 10, winsB: 16, draws: 3, ties: 0, noResults: 0, unknown: 0 };
  assert.equal(h2hRecord(t), "10-3-16");
  assert.equal(h2hOtherResults(t), "3 drawn");
  const d = h2hDescription("England", "India", "Test Cricket", t, 2016);
  assert.equal(d, `England vs India Test Cricket head-to-head record ${testsSince()}: England 10 wins, India 16, 3 drawn in 29 meetings, every result listed.`);
  assert.doesNotMatch(d, /all-time/i);
  // The Test coverage start is read from the one constant, so loading 1877 changes the wording without an edit here.
  assert.equal(h2hSince("test", 2016), `since ${Math.max(TEST_ARCHIVE_START_YEAR, 1877)}`);
  // A limited-overs record has no draw column, and ties and no results are said apart from the wins.
  const o = { league: "t20i" as const, meetings: 12, winsA: 3, winsB: 7, draws: 0, ties: 1, noResults: 1, unknown: 0 };
  assert.equal(h2hRecord(o), "3-7");
  assert.equal(h2hDescription("Canada", "United States of America", "T20 Internationals", o, 2019), "Canada vs United States of America T20 Internationals head-to-head record since 2019: Canada 3 wins, United States of America 7, 1 tied, 1 no result in 12 meetings, every result listed.");
  // A meeting with no recorded result is said, not folded into the counts.
  assert.match(h2hDescription("A", "B", "Test Cricket", { ...t, unknown: 2 }, 2016), /in 27 of 29 meetings with a recorded result/);
  // Other leagues: a record since the first meeting on file, with the W-D-L the page shows.
  const f = { league: "epl" as const, meetings: 12, winsA: 5, winsB: 4, draws: 3, ties: 0, noResults: 0, unknown: 0 };
  assert.equal(h2hDescription("Arsenal", "Chelsea", "Premier League", f, 2015), "Arsenal vs Chelsea Premier League head-to-head record since 2015-16 (5-3-4 in 12 meetings), recent results and biggest wins.");
  assert.equal(h2hDescription("A", "B", "Premier League", { ...f, meetings: 0 }, null), "A vs B in the Premier League: no completed regular-season or playoff meetings in our archive yet.");
});

// ---------------------------------------------------------------------------------------------------------
// getHeadToHead against a database, with real production rows.
// ---------------------------------------------------------------------------------------------------------
let db: TestDb;
let analytics: typeof import("../src/lib/analytics");
// [espn_id, date, home slug, home score, away score, home winner, away winner, ESPN's result line]
type Row = [string, string, string, number, number, boolean | null, boolean | null, string | null];

// England v India Tests, every meeting on the site (2016 to 2025). Wikipedia's Test record for the same
// series: 2016-17 India 4-0 (1 draw), 2018 England 4-1, 2021 India 3-1, 2021 Eng v Ind India 2-1 and 2022 England
// 1-0 for the rescheduled fifth, 2024 India 4-1, 2025 2-2 (1 draw): England 10, India 16, 3 drawn.
const ENG_IND: Row[] = [
  ["1034809", "2016-11-09", "india", 488, 537, false, false, "Match drawn"],
  ["1034811", "2016-11-17", "india", 455, 255, true, false, "India won by 246 runs"],
  ["1034813", "2016-11-26", "india", 417, 283, true, false, "India won by 8 wkts"],
  ["1034815", "2016-12-08", "india", 631, 400, true, false, "India won by an inns & 36 runs"],
  ["1034817", "2016-12-16", "india", 759, 477, true, false, "India won by an inns & 75 runs"],
  ["1119549", "2018-08-01", "england", 287, 274, true, false, "England won by 31 runs"],
  ["1119550", "2018-08-09", "england", 396, 107, true, false, "England won by an inns & 159 runs"],
  ["1119551", "2018-08-18", "england", 161, 329, false, true, "India won by 203 runs"],
  ["1119552", "2018-08-30", "england", 246, 273, true, false, "England won by 60 runs"],
  ["1119553", "2018-09-07", "england", 332, 292, true, false, "England won by 118 runs"],
  ["1243384", "2021-02-05", "india", 337, 578, false, true, "England won by 227 runs"],
  ["1243385", "2021-02-13", "india", 329, 134, true, false, "India won by 317 runs"],
  ["1243386", "2021-02-24", "india", 145, 112, true, false, "India won by 10 wkts"],
  ["1243387", "2021-03-04", "india", 365, 205, true, false, "India won by an inns & 25 runs"],
  ["1239543", "2021-08-04", "england", 183, 278, false, false, "Match drawn"],
  ["1239544", "2021-08-12", "england", 391, 364, false, true, "India won by 151 runs"],
  ["1239545", "2021-08-25", "england", 432, 78, true, false, "England won by an inns & 76 runs"],
  ["1239546", "2021-09-02", "england", 290, 191, false, true, "India won by 157 runs"],
  ["1320741", "2022-07-01", "england", 284, 416, true, false, "England won by 7 wkts"],
  ["1389399", "2024-01-25", "india", 436, 246, false, true, "England won by 28 runs"],
  ["1389400", "2024-02-02", "india", 396, 253, true, false, "India won by 106 runs"],
  ["1389401", "2024-02-15", "india", 445, 319, true, false, "India won by 434 runs"],
  ["1389402", "2024-02-23", "india", 307, 353, true, false, "India won by 5 wkts"],
  ["1389403", "2024-03-07", "india", 477, 218, true, false, "India won by an inns & 64 runs"],
  ["1448349", "2025-06-20", "england", 465, 471, true, false, "England won by 5 wkts"],
  ["1448350", "2025-07-02", "england", 407, 587, false, true, "India won by 336 runs"],
  ["1448351", "2025-07-10", "england", 387, 387, true, false, "England won by 22 runs"],
  ["1448352", "2025-07-23", "england", 669, 358, false, false, "Match drawn"],
  ["1448353", "2025-07-31", "england", 247, 224, false, true, "India won by 6 runs"],
];

// Canada v USA T20Is: a super-over tie, an abandoned match with no flags, and chases won with fewer first-innings runs.
const CAN_USA: Row[] = [
  ["1197401", "2019-08-21", "canada", 145, 144, true, false, "Canada won by 4 wkts (5b rem)"],
  ["1197406", "2019-08-25", "canada", 173, 158, true, false, "Canada won by 15 runs"],
  ["1286674", "2021-11-10", "canada", 142, 142, false, true, "Match tied (United States of America won the Super Over)"],
  ["1425121", "2024-04-07", "canada", 132, 133, false, true, "United States of America won by 6 wkts (15b rem)"],
  ["1425122", "2024-04-09", "united-states-of-america", 230, 199, true, false, "United States of America won by 31 runs"],
  ["1425124", "2024-04-12", "united-states-of-america", 159, 145, true, false, "United States of America won by 14 runs"],
  ["1425125", "2024-04-13", "canada", 168, 169, false, true, "United States of America won by 4 wkts (2b rem)"],
  ["1415701", "2024-06-01", "canada", 194, 197, false, true, "United States of America won by 7 wkts (14b rem)"],
  ["1446762", "2024-08-24", "canada", 169, 0, null, null, "No result"],
  ["1446765", "2024-08-27", "united-states-of-america", 168, 148, true, false, "United States of America won by 20 runs"],
  ["1481312", "2025-04-24", "canada", 184, 167, true, false, "Canada won by 17 runs"],
  ["1481315", "2025-04-27", "canada", 168, 169, false, true, "United States of America won by 6 wkts (5b rem)"],
];

before(async () => {
  db = await startTestDb();
  analytics = await import("../src/lib/analytics");
  ({ rivalryMeter } = await import("../src/lib/rivalry"));
  const team = (league: string, id: string, name: string, slug: string, abbr: string) =>
    db.pool.query(`insert into teams (league, espn_id, name, slug, abbreviation) values ($1,$2,$3,$4,$5)`, [league, id, name, slug, abbr]);
  await team("test", "1", "England", "england", "ENG");
  await team("test", "6", "India", "india", "IND");
  await team("t20i", "17", "Canada", "canada", "CAN");
  await team("t20i", "11", "United States of America", "united-states-of-america", "USA");
  const cricket = async (league: string, a: [string, string], b: [string, string], rows: Row[]) => {
    for (const [id, date, homeSlug, hs, as, hw, aw, summary] of rows) {
      const [home, away] = homeSlug === a[0] ? [a, b] : [b, a];
      await db.pool.query(
        `insert into games (league, espn_id, date, name, home_team_espn_id, away_team_espn_id, home_score, away_score, home_winner, away_winner, status_summary, season_year, completed, status_state)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,true,'post')`,
        [league, id, `${date}T10:00:00Z`, id, home[1], away[1], hs, as, hw, aw, summary, Number(date.slice(0, 4))]
      );
    }
  };
  await cricket("test", ["england", "1"], ["india", "6"], ENG_IND);
  await cricket("t20i", ["canada", "17"], ["united-states-of-america", "11"], CAN_USA);
  // Football, NFL and NBA pairs: the score still decides.
  for (const [league, a, b] of [["epl", "100", "101"], ["nfl", "200", "201"], ["nba", "300", "301"]] as const) {
    await team(league, a, `${league} Alpha`, `${league}-alpha`, "ALP");
    await team(league, b, `${league} Beta`, `${league}-beta`, "BET");
  }
  const score = async (league: string, id: string, date: string, a: string, b: string, hs: number, as: number, year: number) =>
    db.pool.query(
      `insert into games (league, espn_id, date, name, home_team_espn_id, away_team_espn_id, home_score, away_score, season_year, completed, status_state, season_type, competition_type)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,true,'post',2,'STD')`,
      [league, id, `${date}T15:00:00Z`, id, a, b, hs, as, year]
    );
  await score("epl", "f1", "2024-08-17", "100", "101", 2, 1, 2024);
  await score("epl", "f2", "2025-01-12", "101", "100", 1, 1, 2024);
  await score("epl", "f3", "2025-08-16", "101", "100", 3, 0, 2025);
  await score("epl", "f4", "2026-02-07", "100", "101", 0, 0, 2025);
  await score("nfl", "n1", "2024-10-06", "200", "201", 20, 20, 2024);
  await score("nfl", "n2", "2025-10-05", "201", "200", 27, 24, 2025);
  await score("nba", "b1", "2025-11-02", "300", "301", 110, 104, 2026);
  await score("nba", "b2", "2026-01-15", "301", "300", 99, 101, 2026);
});
after(async () => {
  await (await import("../scripts/lib/db")).pool.end();
  await db?.stop();
});

test("England v India Tests: 10 wins, 16 wins and 3 draws, as the stored results say, not 11-17", async () => {
  const h = await analytics.getHeadToHead("test", "england", "india");
  assert.ok(h);
  assert.equal(h.meetings, 29);
  assert.deepEqual({ a: h.winsA, b: h.winsB, d: h.draws, t: h.ties, n: h.noResults, u: h.unknown }, { a: 10, b: 16, d: 3, t: 0, n: 0, u: 0 });
  assert.equal(h2hRecord(h), "10-3-16");
  // The first-innings runs are not goals or points, and a margin of first innings is not a biggest win.
  assert.deepEqual({ a: h.goalsA, b: h.goalsB }, { a: 0, b: 0 });
  assert.equal(h.biggestWinA, null);
  assert.equal(h.biggestWinB, null);
  // Newest meeting India's 6-run win: a run of one, so no streak text on the page.
  assert.deepEqual(h.streak, { team: "B", length: 1 });
  const m = rivalryMeter(h, (t) => t.name);
  assert.deepEqual(m.last5, ["B", "D", "A", "B", "A"]);
  assert.equal(m.label, "Clear edge to India".replace("Clear", "Slight")); // 16 of 26 decided = 61.5%
  // Seen from the other side the tally mirrors.
  const r = await analytics.getHeadToHead("test", "india", "england");
  assert.deepEqual({ a: r!.winsA, b: r!.winsB, d: r!.draws }, { a: 16, b: 10, d: 3 });
});

test("Canada v USA T20Is: the super-over tie and the abandoned match are not wins", async () => {
  const h = await analytics.getHeadToHead("t20i", "canada", "united-states-of-america");
  assert.ok(h);
  assert.deepEqual({ m: h.meetings, a: h.winsA, b: h.winsB, d: h.draws, t: h.ties, n: h.noResults, u: h.unknown }, { m: 12, a: 3, b: 7, d: 0, t: 1, n: 1, u: 0 });
  assert.equal(h2hRecord(h), "3-7");
  assert.equal(h2hOtherResults(h), "1 tied, 1 no result");
  // Newest first: USA chase, Canada win, USA win, the abandoned match, USA chase.
  assert.deepEqual(rivalryMeter(h, (t) => t.name).last5, ["B", "A", "B", "N", "B"]);
});

test("a meeting whose result the data does not state is counted apart and said", async () => {
  await db.pool.query(
    `insert into games (league, espn_id, date, name, home_team_espn_id, away_team_espn_id, home_score, away_score, season_year, completed, status_state)
     values ('t20i','mystery','2026-03-01T10:00:00Z','x','17','11',150,140,2026,true,'post')`
  );
  const h = await analytics.getHeadToHead("t20i", "canada", "united-states-of-america");
  assert.deepEqual({ m: h!.meetings, a: h!.winsA, b: h!.winsB, u: h!.unknown }, { m: 13, a: 3, b: 7, u: 1 });
  assert.equal(recordedResultNote(h!), "Results are recorded for 12 of 13 meetings; the other is left out of the record.");
  // The newest meeting has no result, so no current run is claimed.
  assert.equal(h!.streak, null);
  assert.equal(rivalryMeter(h!, (t) => t.name).last5[0], "B");
  await db.pool.query(`delete from games where espn_id = 'mystery'`);
});

test("football, NFL and NBA head-to-heads are counted as before", async () => {
  const e = await analytics.getHeadToHead("epl", "epl-alpha", "epl-beta");
  assert.deepEqual({ m: e!.meetings, a: e!.winsA, b: e!.winsB, d: e!.draws, t: e!.ties, n: e!.noResults, u: e!.unknown, ga: e!.goalsA, gb: e!.goalsB }, { m: 4, a: 1, b: 1, d: 2, t: 0, n: 0, u: 0, ga: 3, gb: 5 });
  assert.equal(h2hRecord(e!), "1-2-1");
  assert.equal(e!.biggestWinB?.espn_id, "f3");
  assert.deepEqual(e!.streak, { team: null, length: 1 });
  const n = await analytics.getHeadToHead("nfl", "nfl-alpha", "nfl-beta");
  assert.deepEqual({ m: n!.meetings, a: n!.winsA, b: n!.winsB, d: n!.draws }, { m: 2, a: 0, b: 1, d: 1 });
  const b = await analytics.getHeadToHead("nba", "nba-alpha", "nba-beta");
  assert.deepEqual({ m: b!.meetings, a: b!.winsA, b: b!.winsB, d: b!.draws, ga: b!.goalsA, gb: b!.goalsB }, { m: 2, a: 2, b: 0, d: 0, ga: 211, gb: 203 });
  assert.deepEqual(b!.streak, { team: "A", length: 2 });
});
