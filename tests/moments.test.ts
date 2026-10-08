import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { startTestDb, type TestDb } from "./helpers/testDb";

// "Moments you missed" against a real database: the window, the order, whose side the score is told from, one
// moment per game, and every kind of row that must not count. All times are fixed so nothing depends on the clock.

let db: TestDb;
let loadMoments: typeof import("../src/lib/moments").loadMoments;
let parseTeams: typeof import("../src/lib/moments").parseTeams;
let windowStart: typeof import("../src/lib/moments").windowStart;
let GET: (request: Request, ctx: { params: Promise<{ type: string }> }) => Promise<Response>;
const q = (sql: string, args: unknown[] = []) => db.pool.query(sql, args);

const NOW = new Date("2026-10-08T12:00:00Z");
const sec = (iso: string) => Math.floor(new Date(iso).getTime() / 1000);
const SINCE = sec("2026-10-05T12:00:00Z");
const ids = (r: { moments: { id: string }[] }) => r.moments.map((m) => m.id);

async function game(league: string, id: string, date: string, home: string, away: string, hs: number | null, as: number | null, extra: { completed?: boolean; detail?: string | null } = {}) {
  await q(
    `insert into games (league, espn_id, date, name, home_team_espn_id, away_team_espn_id, season_year, completed, status_detail, home_score, away_score) values ($1,$2,$3,$2,$4,$5,2026,$6,$7,$8,$9)`,
    [league, id, date, home, away, extra.completed ?? true, extra.detail ?? null, hs, as]
  );
}

before(async () => {
  db = await startTestDb();
  ({ loadMoments, parseTeams, windowStart } = await import("../src/lib/moments"));
  ({ GET } = await import("../src/app/api/block/[type]/route"));
  await q(
    `insert into teams (league, espn_id, name, slug, abbreviation) values
       ('epl','1','Arsenal','arsenal','ARS'), ('epl','2','Chelsea','chelsea','CHE'), ('epl','3','Liverpool','liverpool','LIV'),
       ('nba','31','Boston Celtics','boston-celtics','BOS'), ('nba','32','Miami Heat','miami-heat','MIA'),
       ('ipl','41','Chennai Super Kings','chennai-super-kings','CSK'), ('ipl','42','Mumbai Indians','mumbai-indians','MI')`
  );
  // Arsenal
  await game("epl", "e1", "2026-10-07T15:00:00Z", "1", "2", 2, 1); // home win
  await game("epl", "e2", "2026-10-06T15:00:00Z", "3", "1", 3, 0); // away loss, home side scored first in the row
  await game("epl", "e3", "2026-10-04T15:00:00Z", "1", "2", 1, 1); // before the window
  await game("epl", "e4", "2026-10-09T18:00:00Z", "1", "3", null, null, { completed: false }); // in the future
  await game("epl", "e5", "2026-10-07T12:00:00Z", "2", "1", 2, 2); // away draw
  await game("epl", "e6", "2026-10-07T20:00:00Z", "1", "3", null, null, { completed: false }); // played today, not finished
  await game("epl", "e7", "2026-10-07T21:00:00Z", "1", "3", null, null); // marked complete with no score: not a result
  await game("epl", "e8", "2026-10-07T10:00:00Z", "1", "2", 0, 0, { detail: "Postponed" }); // called off
  await game("epl", "e9", "2026-10-07T09:00:00Z", "2", "3", 1, 0); // neither team is Arsenal
  await game("epl", "e10", "2026-10-05T12:00:00Z", "1", "3", 4, 0); // exactly at the start: not after it
  await game("epl", "e11", "2026-10-08T11:59:00Z", "3", "1", 0, 1); // a minute before now: counts
  // NBA
  await game("nba", "n1", "2026-10-07T00:30:00Z", "31", "32", 110, 100);
  // Heat: seven results, for the cap and the seven-day limit
  for (let d = 1; d <= 7; d++) await game("nba", `h${d}`, `2026-10-0${d}T13:00:00Z`, "32", "31", 90 + d, 100);
  await game("nba", "hold", "2026-09-30T13:00:00Z", "32", "31", 1, 2); // older than seven days
  // IPL (stored in games with display scores and a summary)
  await q(
    `insert into games (league, espn_id, date, name, home_team_espn_id, away_team_espn_id, season_year, completed, status_summary, home_score_display, away_score_display)
     values ('ipl','i1','2026-10-07T14:00:00Z','CSK v MI','41','42',2026,true,'CSK won by 5 wickets','180/4','176/8'),
            ('ipl','i2','2026-10-06T14:00:00Z','MI v CSK','42','41',2026,true,'No result','','')`
  );
  // Cricket sides (India 6, Australia 7, Ireland 8)
  await q(`insert into cricket_series (espn_id, name, kind) values ('S','Test Series','international')`);
  const side = (id: string, name: string, abbr: string, score: string, winner = false) => JSON.stringify({ id, name, abbreviation: abbr, score, winner, logo: null });
  const m = (id: string, date: string, state: string, summary: string, home: string, away: string) =>
    q(`insert into cricket_series_matches (espn_id, series_espn_id, date, name, status_state, status_summary, home, away, league_candidates) values ($1,'S',$2,$1,$3,$4,$5,$6,$7)`, [id, date, state, summary, home, away, id === "c2" ? ["odi"] : []]);
  await m("c1", "2026-10-07T09:00:00Z", "post", "Australia won by 5 wkts", side("6", "India", "IND", "250/9"), side("7", "Australia", "AUS", "251/5 (49.2/50 ov, target 251)"));
  await m("c2", "2026-10-06T09:00:00Z", "post", "India won by 20 runs", side("6", "India", "IND", "300/6"), side("8", "Ireland", "IRE", "280/9"));
  await m("c3", "2026-10-09T09:00:00Z", "pre", "Match starts at 9:00", side("6", "India", "IND", ""), side("8", "Ireland", "IRE", ""));
  await m("c4", "2026-10-06T10:00:00Z", "post", "Match abandoned", side("6", "India", "IND", ""), side("7", "Australia", "AUS", ""));
  await m("c5", "2026-10-06T11:00:00Z", "post", "No result", side("6", "India", "IND", ""), side("7", "Australia", "AUS", ""));
  await m("c6", "2026-10-07T07:00:00Z", "post", "Match tied", side("8", "Ireland", "IRE", "200"), side("6", "India", "IND", "200"));
  await m("c7", "2026-09-20T09:00:00Z", "post", "India won by 1 run", side("6", "India", "IND", "1"), side("8", "Ireland", "IRE", "0"));
  await q(`insert into games (league, espn_id, date, name, home_team_espn_id, away_team_espn_id, completed) values ('odi','c2','2026-10-06T09:00:00Z','x','6','8',true)`);
  await q(`insert into teams (league, espn_id, name, slug) values ('odi','6','India','india'), ('odi','8','Ireland','ireland')`);
});

after(async () => {
  await (await import("../src/lib/db")).pool.end();
  await db.stop();
});

const follow = (teams: string, since = SINCE) => loadMoments(parseTeams(teams), since, NOW);

test("only finished, scored games inside the window count, newest first", async () => {
  const r = await follow("epl:arsenal");
  assert.deepEqual(ids(r), ["epl/e11", "epl/e1", "epl/e5", "epl/e2"]);
  assert.equal(r.total, 4);
  assert.equal(r.since, "2026-10-05T12:00:00.000Z");
});

test("the score and result are told from the followed team's side, home or away", async () => {
  const r = await follow("epl:arsenal");
  const by = Object.fromEntries(r.moments.map((m) => [m.id, m]));
  assert.deepEqual({ ...by["epl/e1"], date: undefined }, { id: "epl/e1", date: undefined, team: "Arsenal", opponent: "Chelsea", home: true, score: "2-1", result: "W", summary: null, href: "/epl/games/e1", league: "epl" });
  assert.deepEqual([by["epl/e2"].opponent, by["epl/e2"].home, by["epl/e2"].score, by["epl/e2"].result], ["Liverpool", false, "0-3", "L"]);
  assert.deepEqual([by["epl/e5"].opponent, by["epl/e5"].home, by["epl/e5"].score, by["epl/e5"].result], ["Chelsea", false, "2-2", "D"]);
  assert.deepEqual([by["epl/e11"].opponent, by["epl/e11"].home, by["epl/e11"].score, by["epl/e11"].result], ["Liverpool", false, "1-0", "W"]);
  assert.equal(by["epl/e1"].date, "2026-10-07T15:00:00.000Z");
});

test("the same game seen from the other team is told from that team's side", async () => {
  const r = await follow("epl:chelsea");
  const e1 = r.moments.find((m) => m.id === "epl/e1")!;
  assert.deepEqual([e1.team, e1.opponent, e1.home, e1.score, e1.result], ["Chelsea", "Arsenal", false, "1-2", "L"]);
});

test("a game between two followed teams is one moment, told from the team listed first", async () => {
  const a = await follow("epl:arsenal,epl:chelsea");
  const b = await follow("epl:chelsea,epl:arsenal");
  for (const r of [a, b]) {
    assert.equal(new Set(ids(r)).size, ids(r).length, "no duplicates");
    assert.equal(ids(r).filter((id) => id === "epl/e1").length, 1);
    assert.equal(ids(r).filter((id) => id === "epl/e5").length, 1);
    assert.equal(r.total, ids(r).length);
  }
  assert.equal(a.moments.find((m) => m.id === "epl/e1")!.team, "Arsenal");
  assert.equal(b.moments.find((m) => m.id === "epl/e1")!.team, "Chelsea");
  // Chelsea's own extra result (e9 v Liverpool) now counts; Arsenal's four stay.
  assert.deepEqual(ids(a), ["epl/e11", "epl/e1", "epl/e5", "epl/e9", "epl/e2"]);
});

test("the same team listed twice does not double its results", async () => {
  const r = await follow("epl:arsenal,epl:arsenal");
  assert.deepEqual(ids(r), ["epl/e11", "epl/e1", "epl/e5", "epl/e2"]);
});

test("teams in different sports are merged by date, each in its own league", async () => {
  const r = await follow("epl:arsenal,nba:boston-celtics");
  // The Celtics also played the Heat games h1 to h7 (a Heat home game each day), so those sit among Arsenal's results.
  assert.deepEqual(ids(r), ["epl/e11", "epl/e1", "nba/h7", "epl/e5", "nba/n1"]);
  assert.equal(r.total, 4 + 4); // Arsenal's four; the Celtics' h5 to h7 and n1 inside the window
  const n1 = r.moments.find((m) => m.id === "nba/n1")!;
  assert.deepEqual([n1.team, n1.opponent, n1.score, n1.result, n1.href], ["Boston Celtics", "Miami Heat", "110-100", "W", "/nba/games/n1"]);
});

test("at most five moments come back and total still counts them all, within seven days whatever the last visit", async () => {
  const r = await follow("nba:miami-heat", sec("2020-01-01T00:00:00Z"));
  assert.equal(r.since, "2026-10-01T12:00:00.000Z");
  // h1 (10-01 13:00) .. h7, plus n1 (Celtics v Heat, 10-07): eight in the week; "hold" (09-30) is out.
  assert.equal(r.total, 8);
  assert.equal(r.moments.length, 5);
  assert.deepEqual(ids(r), ["nba/h7", "nba/n1", "nba/h6", "nba/h5", "nba/h4"]);
  const n1 = r.moments[1];
  assert.deepEqual([n1.team, n1.opponent, n1.home, n1.score, n1.result], ["Miami Heat", "Boston Celtics", false, "100-110", "L"]);
  const h7 = r.moments[0];
  assert.deepEqual([h7.home, h7.score, h7.result], [true, "97-100", "L"]);
});

test("windowStart never reaches back more than seven days, and a visit in the future leaves nothing to catch up on", async () => {
  assert.equal(windowStart(sec("2020-01-01T00:00:00Z"), NOW).toISOString(), "2026-10-01T12:00:00.000Z");
  assert.equal(windowStart(sec("2026-10-07T00:00:00Z"), NOW).toISOString(), "2026-10-07T00:00:00.000Z");
  const r = await follow("epl:arsenal", sec("2026-10-09T00:00:00Z"));
  assert.deepEqual(r, { since: "2026-10-09T00:00:00.000Z", total: 0, moments: [] });
});

test("empty states: no results since, an unknown team, no teams", async () => {
  assert.deepEqual((await follow("epl:arsenal", sec("2026-10-08T11:59:30Z"))).moments, []);
  const none = await follow("epl:nobody");
  assert.equal(none.total, 0);
  assert.deepEqual(none.moments, []);
  assert.equal((await follow("epl:liverpool", sec("2026-10-08T11:59:30Z"))).total, 0);
  assert.equal((await loadMoments([], SINCE, NOW)).total, 0);
});

test("a cricket league team: the result in the site's words, scores from the team's side, no-result left out", async () => {
  const csk = await follow("ipl:chennai-super-kings");
  assert.deepEqual(ids(csk), ["cricket/i1"]);
  assert.deepEqual(
    { ...csk.moments[0], date: undefined },
    { id: "cricket/i1", date: undefined, team: "Chennai Super Kings", opponent: "Mumbai Indians", home: true, score: "180/4 v 176/8", result: "W", summary: "Chennai Super Kings beat Mumbai Indians by 5 wickets", href: "/ipl/games/i1", league: "ipl" }
  );
  const mi = await follow("ipl:mumbai-indians");
  assert.deepEqual([mi.moments[0].result, mi.moments[0].home, mi.moments[0].score], ["L", false, "176/8 v 180/4"]);
});

test("a cricket side: winner from the margin, tie as a draw, called off and no result left out, own score first", async () => {
  const r = await follow("cricket:6");
  assert.deepEqual(ids(r), ["cricket/c1", "cricket/c6", "cricket/c2"]);
  const [c1, c6, c2] = r.moments;
  assert.deepEqual({ ...c1, date: undefined }, { id: "cricket/c1", date: undefined, team: "India", opponent: "Australia", home: true, score: "250/9 v 251/5", result: "L", summary: "Australia beat India by 5 wickets", href: "/cricket/matches/c1", league: "cricket" });
  assert.deepEqual([c6.result, c6.home, c6.summary, c6.opponent], ["D", false, "Ireland and India tied", "Ireland"]);
  assert.equal(c2.result, "W");
  assert.equal(c2.href, "/odi/games/c2", "a match with a stored scorecard links to its game page");
  assert.equal(r.total, 3);
});

test("a cricket match two followed sides played is one moment, from the side listed first", async () => {
  const r = await follow("cricket:7,cricket:6");
  assert.equal(ids(r).filter((id) => id === "cricket/c1").length, 1);
  const c1 = r.moments.find((m) => m.id === "cricket/c1")!;
  assert.deepEqual([c1.team, c1.opponent, c1.result, c1.score], ["Australia", "India", "W", "251/5 v 250/9"]);
});

test("a match followed both as an IPL team and as a cricket side is not listed twice", async () => {
  await q(`insert into cricket_series_matches (espn_id, series_espn_id, date, name, status_state, status_summary, home, away) values ('i1','S','2026-10-07T14:00:00Z','CSK v MI','post','CSK won by 5 wickets',$1,$2)`, [
    JSON.stringify({ id: "41", name: "Chennai Super Kings", abbreviation: "CSK", score: "180/4", winner: true }),
    JSON.stringify({ id: "42", name: "Mumbai Indians", abbreviation: "MI", score: "176/8", winner: false }),
  ]);
  const r = await follow("ipl:chennai-super-kings,cricket:41");
  assert.equal(ids(r).filter((id) => id === "cricket/i1").length, 1);
  await q(`delete from cricket_series_matches where espn_id = 'i1'`);
});

const call = (query: string) => GET(new Request(`http://localhost/api/block/moments${query}`), { params: Promise.resolve({ type: "moments" }) });

test("the route serves moments with the short edge cache, and rejects bad input", async () => {
  const res = await call(`?teams=${encodeURIComponent("epl:arsenal")}&since=${sec("2026-09-01T00:00:00Z")}`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("cache-control"), "public, s-maxage=120, stale-while-revalidate=480");
  const { block } = await res.json();
  assert.equal(typeof block.total, "number");
  assert.ok(Array.isArray(block.moments) && block.moments.length <= 5);
  for (const bad of ["", "?teams=epl:arsenal", "?since=1790000000", "?teams=f1:ferrari&since=1790000000", "?teams=epl:arsenal&since=soon"]) {
    assert.equal((await call(bad)).status, 400, bad);
  }
});
