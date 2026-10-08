// Tennis data quality, found by the 2026-10-08 accuracy audit and checked against production rows that day:
//  - the 2016-2022 backfills stored the same singles match under two ids (1,943 groups; Sinner 2022 read 60-19 against
//    46-16 once counted once), so records, head-to-head, rivals and every list must count a match once;
//  - 24 qualifiers ESPN's daily window dropped stayed "pre" / "Time TBD" with no result; the scraper now finishes them
//    from the match's own resource, and a match still "pre" long after its start no longer reads as upcoming;
//  - raw "event" is not a round, and the Laver Cup labels every rubber "Final";
//  - a woman's ATP row (a United Cup rubber) redirects to her WTA page;
//  - a retirement's "0-0" set was never played.
import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { startTestDb, type TestDb } from "./helpers/testDb";
import { tennisMatchStatus, withoutUnplayedSets } from "../src/lib/tennisDisplay";
import { parseCoreCompetition, reconcileStaleMatches, scoreText, type CoreCompetition } from "../scripts/lib/tennisReconcile";

let db: TestDb;
let tennis: typeof import("../src/lib/tennis");

before(async () => {
  db = await startTestDb();
  tennis = await import("../src/lib/tennis");
});
after(async () => {
  await (await import("../src/lib/db")).pool.end();
  await db?.stop();
});

const side = (ids: string[], sets: { games: number; tiebreak?: number | null; winner?: boolean }[] = []) =>
  JSON.stringify({ ids, names: ids.map((i) => `Player ${i}`), countries: ids.map(() => null), seed: null, rank: null, score: null, sets: sets.map((s) => ({ tiebreak: null, winner: false, ...s })) });

interface M {
  id: string;
  tour?: string;
  type?: string | null;
  round?: string | null;
  date: string;
  p1: string;
  p2: string;
  winner?: string | null;
  detail?: string;
  state?: string;
  completed?: boolean;
  tournament?: string;
  tname?: string;
  court?: string | null;
  s1?: string;
  s2?: string;
}

async function put(m: M) {
  await db.pool.query(
    `insert into tennis_matches (tour, espn_id, tournament_espn_id, tournament_name, round, date, player1_espn_id, player2_espn_id, winner_espn_id,
                                 completed, status_state, status_detail, competition_type, day, court, side1, side2)
     values ($1, $2, $3, $4, $5, $6::timestamptz, $7, $8, $9, $10, $11, $12, $13, ($6::timestamptz at time zone 'America/New_York')::date, $14, $15::jsonb, $16::jsonb)`,
    [
      m.tour ?? "atp",
      m.id,
      m.tournament ?? "t-2022",
      m.tname ?? "Some Open",
      m.round === undefined ? "Round 1" : m.round,
      m.date,
      m.p1,
      m.p2,
      m.winner === undefined ? m.p1 : m.winner,
      m.completed ?? true,
      m.state ?? "post",
      m.detail ?? "Final",
      m.type === undefined ? "mens-singles" : m.type,
      m.court ?? null,
      m.s1 ?? side([m.p1]),
      m.s2 ?? side([m.p2]),
    ]
  );
}

beforeEach(async () => {
  await db.pool.query(`delete from tennis_matches`);
  await db.pool.query(`delete from tennis_tournaments`);
  await db.pool.query(`delete from players`);
  await db.pool.query(
    `insert into players (league, espn_id, name, slug) values ('atp','10','Jannik S','jannik-s'), ('atp','20','Opp Twenty','opp-twenty'), ('atp','30','Opp Thirty','opp-thirty')`
  );
});

/* ---------------------------------------------------------------------------------------------------------------- */
/* Duplicates                                                                                                        */
/* ---------------------------------------------------------------------------------------------------------------- */

// The three shapes seen in production: two crawls of one Australian Open day (same round, two ids, other court), the
// tournament-feed copy with the round "event" and no court, and a Davis Cup tie filed under two event ids.
async function sinner2022() {
  await put({ id: "115128", date: "2022-01-18T03:05:00Z", p1: "20", p2: "10", winner: "10", court: "Court 5", tournament: "154-2022", tname: "Australian Open" });
  await put({ id: "171284", date: "2022-01-18T03:05:00Z", p1: "20", p2: "10", winner: "10", court: "KIA Arena", tournament: "154-2022", tname: "Australian Open" });
  await put({ id: "114142", date: "2022-02-22T12:05:00Z", p1: "30", p2: "10", winner: "10", court: "Centre Court", tournament: "25-2022", tname: "Dubai" });
  await put({ id: "155021", date: "2022-02-22T12:10:00Z", p1: "30", p2: "10", winner: "10", round: "event", court: null, tournament: "25-2022", tname: "Dubai" });
  await put({ id: "167518", date: "2022-02-22T12:10:00Z", p1: "30", p2: "10", winner: "10", round: "event", court: null, tournament: "25-2022", tname: "Dubai" });
  await put({ id: "126414", date: "2022-03-04T16:15:00Z", p1: "20", p2: "10", winner: "10", type: "team-cup", tournament: "928-2022", tname: "Davis Cup Qualifying" });
  await put({ id: "159579", date: "2022-03-04T16:15:00Z", p1: "20", p2: "10", winner: "10", type: "team-cup", tournament: "846-2022", tname: "Davis Cup - Slovakia vs Italy" });
  await put({ id: "900001", date: "2022-05-10T12:00:00Z", p1: "10", p2: "20", winner: "20", tournament: "414-2022", tname: "Rome" }); // a real loss, once
}

test("a match stored under two or three ids counts once in the season record", async () => {
  await sinner2022();
  const r = await tennis.getTennisPlayerSeasonRecords("atp", "10");
  assert.deepEqual(r, [{ season: 2022, wins: 3, losses: 1, titles: 0 }]);
});

test("head-to-head and rivals count the match once", async () => {
  await sinner2022();
  const ids = (await tennis.getTennisHeadToHead("atp", "10", "20")).map((m) => m.espn_id).sort();
  assert.deepEqual(ids, ["115128", "126414", "900001"].sort());
  const rivals = Object.fromEntries((await tennis.getTennisPlayerRivals("atp", "10")).map((r) => [r.espn_id, [r.matches, r.wins]]));
  assert.deepEqual(rivals, { "20": [3, 2], "30": [1, 1] });
});

test("the copy kept is the one with a real round, then the lowest id", async () => {
  await sinner2022();
  const matches = await tennis.getTennisPlayerMatches("atp", "10");
  const dubai = matches.filter((m) => m.tournament_espn_id === "25-2022");
  assert.deepEqual(dubai.map((m) => [m.espn_id, m.round]), [["114142", "Round 1"]]);
  assert.deepEqual(matches.filter((m) => m.tournament_espn_id === "154-2022").map((m) => m.espn_id), ["115128"]);
});

test("day and tournament lists show a duplicated match once, and the tournament counts follow", async () => {
  await sinner2022();
  await db.pool.query(`insert into tennis_tournaments (espn_id, tour, tournament_id, season, name) values ('25-2022','atp','25',2022,'Dubai')`);
  const day = await tennis.getTennisDay("2022-02-22");
  assert.equal(day.length, 1);
  const t = await tennis.getTennisTournament("25-2022");
  assert.equal(t?.match_count, 1);
  assert.equal(t?.completed_count, 1);
  assert.equal((await tennis.getTennisTournamentMatches("25-2022")).length, 1);
});

test("an 'event' copy is kept when it is the only one, and a lower id with 'event' loses to a higher id with a round", async () => {
  await put({ id: "1", date: "2022-02-22T12:05:00Z", p1: "30", p2: "10", round: "event", court: null });
  assert.equal((await tennis.getTennisPlayerMatches("atp", "10")).length, 1);
  await put({ id: "2", date: "2022-02-22T12:05:00Z", p1: "30", p2: "10", round: "Round 2" });
  const m = await tennis.getTennisPlayerMatches("atp", "10");
  assert.deepEqual(m.map((x) => x.espn_id), ["2"]);
});

test("two different matches between the same players on different days, and the same day in different tours, are both kept", async () => {
  await put({ id: "a", date: "2022-02-22T12:00:00Z", p1: "10", p2: "20" });
  await put({ id: "b", date: "2022-02-23T12:00:00Z", p1: "10", p2: "20" });
  await put({ id: "c", tour: "wta", date: "2022-02-22T12:00:00Z", p1: "10", p2: "20", type: "womens-singles" });
  assert.deepEqual((await tennis.getTennisPlayerMatches("atp", "10")).map((m) => m.espn_id).sort(), ["a", "b"]);
  assert.deepEqual((await tennis.getTennisPlayerMatches("wta", "10")).map((m) => m.espn_id), ["c"]);
});

test("doubles rows, team-event doubles rubbers and rows without sides are never treated as duplicates", async () => {
  await put({ id: "d1", date: "2022-02-22T12:00:00Z", p1: "10", p2: "20", type: "mens-doubles", s1: side(["10", "11"]), s2: side(["20", "21"]) });
  await put({ id: "d2", date: "2022-02-22T14:00:00Z", p1: "10", p2: "20", type: "mens-doubles", s1: side(["10", "12"]), s2: side(["20", "22"]) });
  await put({ id: "t1", date: "2022-02-22T15:00:00Z", p1: "10", p2: "20", type: "team-cup", s1: side(["10", "13"]), s2: side(["20", "23"]) });
  assert.equal((await tennis.getTennisPlayerMatches("atp", "10")).length, 3);
});

test("a final stored twice makes one champion, not two", async () => {
  await db.pool.query(`insert into tennis_tournaments (espn_id, tour, tournament_id, season, name) values ('t-2022','atp','t',2022,'Some Open')`);
  await put({ id: "f1", date: "2022-02-27T12:00:00Z", p1: "10", p2: "20", round: "Final" });
  await put({ id: "f2", date: "2022-02-27T12:10:00Z", p1: "10", p2: "20", round: "Final", court: "Centre Court" });
  const t = await tennis.getTennisTournament("t-2022");
  assert.equal(t?.champions.length, 1);
  const r = await tennis.getTennisPlayerSeasonRecords("atp", "10");
  assert.deepEqual(r, [{ season: 2022, wins: 1, losses: 0, titles: 1 }]);
});

/* ---------------------------------------------------------------------------------------------------------------- */
/* What the round says                                                                                               */
/* ---------------------------------------------------------------------------------------------------------------- */

test("the raw round 'event' is shown as no round, a Laver Cup 'Final' too, a Davis Cup 'Final' is kept", async () => {
  await put({ id: "e1", date: "2019-02-22T12:00:00Z", p1: "10", p2: "20", round: "event" });
  await put({ id: "l1", date: "2026-09-25T12:00:00Z", p1: "10", p2: "30", round: "Final", type: "team-cup", tournament: "840-2026", tname: "Laver Cup" });
  await put({ id: "l2", date: "2026-09-26T12:00:00Z", p1: "10", p2: "30", round: "Final", type: "team-cup", tournament: "840-2026", tname: "Laver Cup" });
  await put({ id: "d1", date: "2026-11-21T12:00:00Z", p1: "10", p2: "20", round: "Final", type: "team-cup", tournament: "968-2026", tname: "Davis Cup Finals" });
  const rounds = Object.fromEntries((await tennis.getTennisPlayerMatches("atp", "10")).map((m) => [m.espn_id, m.round]));
  assert.deepEqual(rounds, { e1: null, l1: null, l2: null, d1: "Final" });
});

/* ---------------------------------------------------------------------------------------------------------------- */
/* Unplayed sets                                                                                                     */
/* ---------------------------------------------------------------------------------------------------------------- */

const withSets = (a: [number, number | null][], b: [number, number | null][], over: Record<string, unknown> = {}) => ({
  completed: true,
  status_state: "post" as string | null,
  side1: { sets: a.map(([games, tiebreak]) => ({ games, tiebreak, winner: false })) },
  side2: { sets: b.map(([games, tiebreak]) => ({ games, tiebreak, winner: false })) },
  ...over,
});

test("a finished match loses its trailing 0-0 set, and nothing else", () => {
  const m = withoutUnplayedSets(withSets([[6, null], [7, 7], [0, null]], [[3, null], [6, 5], [0, null]]));
  assert.deepEqual(m.side1.sets.map((s) => s.games), [6, 7]);
  assert.deepEqual(m.side2.sets.map((s) => s.games), [3, 6]);
  const ret = withoutUnplayedSets(withSets([[6, null], [0, null]], [[4, null], [0, null]]));
  assert.equal(ret.side1.sets.length, 1);
  // 6-0 6-0 is two played sets
  assert.equal(withoutUnplayedSets(withSets([[6, null], [6, null]], [[0, null], [0, null]])).side1.sets.length, 2);
  // a 0-0 set before a played one stays; a 0-0 set with a tie-break point count is a played set
  assert.equal(withoutUnplayedSets(withSets([[0, null], [6, null]], [[0, null], [3, null]])).side1.sets.length, 2);
  assert.equal(withoutUnplayedSets(withSets([[6, null], [0, 1]], [[4, null], [0, 0]])).side1.sets.length, 2);
});

test("a match in play or not yet played keeps its 0-0 set (a new set starts 0-0)", () => {
  const live = withSets([[6, null], [0, null]], [[4, null], [0, null]], { completed: false, status_state: "in" });
  assert.equal(withoutUnplayedSets(live).side1.sets.length, 2);
});

test("queries return finished matches without the unplayed set", async () => {
  await put({ id: "ph", date: "2022-02-22T12:00:00Z", p1: "10", p2: "20", detail: "Retired", s1: side(["10"], [{ games: 6, winner: true }, { games: 0 }]), s2: side(["20"], [{ games: 4 }, { games: 0 }]) });
  const [m] = await tennis.getTennisPlayerMatches("atp", "10");
  assert.equal(m.side1.sets.length, 1);
  assert.equal(m.side2.sets.length, 1);
});

/* ---------------------------------------------------------------------------------------------------------------- */
/* Stale "pre" matches                                                                                               */
/* ---------------------------------------------------------------------------------------------------------------- */

const NOW = Date.parse("2026-10-08T12:00:00Z");
const pre = (over: Record<string, unknown> = {}) => ({
  date: "2026-10-05T04:00:00Z",
  completed: false,
  status_state: "pre" as string | null,
  status_detail: "M/d - 'TBD'" as string | null,
  winner_side: null as 1 | 2 | null,
  ...over,
});

test("a TBD or scheduled match three days past its start reads 'No result', never Time TBD or Upcoming", () => {
  assert.deepEqual(tennisMatchStatus(pre(), NOW), { kind: "called-off", label: "No result" });
  assert.deepEqual(tennisMatchStatus(pre({ status_detail: "Mon, October 5th at 12:00 AM EDT" }), NOW), { kind: "called-off", label: "No result" });
});

test("the same match on its own day, or a future one, is still Time TBD / upcoming", () => {
  assert.deepEqual(tennisMatchStatus(pre({ date: "2026-10-08T04:00:00Z" }), NOW), { kind: "upcoming", label: "Time TBD" });
  assert.deepEqual(tennisMatchStatus(pre({ date: "2026-10-09T04:00:00Z", status_detail: "Fri, October 9th at 8:00 AM EDT" }), NOW), { kind: "upcoming", label: null });
  // 26 h after a midnight-Eastern placeholder is still the day's play
  assert.equal(tennisMatchStatus(pre({ date: "2026-10-07T10:00:00Z" }), NOW).label, "Time TBD");
});

test("results, live matches and called-off labels are unchanged", () => {
  assert.equal(tennisMatchStatus(pre({ completed: true, status_state: "post", status_detail: "Final", winner_side: 1 }), NOW).label, "Final");
  assert.equal(tennisMatchStatus(pre({ status_state: "in", status_detail: "2nd Set" }), NOW).kind, "live");
  assert.equal(tennisMatchStatus(pre({ completed: true, status_state: "post", status_detail: "Canceled" }), NOW).label, "Cancelled");
});

/* ---- the scraper finishes them ---- */

const core = (over: { state?: string; completed?: boolean; detail?: string; name?: string; winner?: string | null; sets?: Record<string, [number, number | null][]>; date?: string } = {}): CoreCompetition => {
  const sets = over.sets ?? { "10": [[6, null], [7, 7]], "20": [[4, null], [6, 5]] };
  const winner = over.winner === undefined ? "10" : over.winner;
  return {
    competition: { date: over.date ?? "2026-10-05T05:40Z", competitors: ["10", "20"].map((id) => ({ id, winner: id === winner })) },
    status: { type: { name: over.name ?? "STATUS_FINAL", state: over.state ?? "post", completed: over.completed ?? true, detail: over.detail ?? "Final" } },
    linescores: Object.fromEntries(Object.entries(sets).map(([id, ls]) => [id, { items: ls.map(([value, tiebreak], i) => ({ value, period: i + 1, ...(tiebreak != null ? { tiebreak } : {}) })) }])),
  };
};

async function stale(id: string, over: Partial<M> = {}) {
  await put({ id, date: new Date(Date.now() - 3 * 86_400_000).toISOString(), p1: "10", p2: "20", winner: null, completed: false, state: "pre", detail: "M/d - 'TBD'", tournament: "315-2026", tname: "Shanghai", round: "Qualifying 1st Round", ...over });
}
const row = async (id: string) => (await db.pool.query(`select * from tennis_matches where espn_id = $1`, [id])).rows[0];

test("parseCoreCompetition: sets with tie-breaks, the winner, an unplayed 0-0 set dropped, a retirement's set not decided", () => {
  const r = parseCoreCompetition(core({ sets: { "10": [[6, null], [7, 7], [0, null]], "20": [[4, null], [6, 5], [0, null]] } }))!;
  assert.equal(r.winnerId, "10");
  assert.deepEqual(r.sets["10"], [{ games: 6, tiebreak: null, winner: true }, { games: 7, tiebreak: 7, winner: true }]);
  assert.deepEqual(r.sets["20"].map((s) => s.winner), [false, false]);
  assert.equal(scoreText(r.sets["10"], r.sets["20"]), "6-4 7-6(7-5)");
  assert.equal(scoreText(r.sets["20"], r.sets["10"]), "4-6 6-7(5-7)");
  const ret = parseCoreCompetition(core({ detail: "Retired", name: "STATUS_RETIRED", sets: { "10": [[5, null]], "20": [[2, null]] } }))!;
  assert.equal(ret.sets["10"][0].winner, false, "5-2 is an interrupted set, not a won one");
  assert.equal(parseCoreCompetition({ competition: { competitors: [{ id: "1" }] }, status: null, linescores: {} }), null);
});

test("reconcile completes a stale qualifier from ESPN's own resource and leaves the rest of the row alone", async () => {
  await stale("s1");
  const calls: string[] = [];
  const r = await reconcileStaleMatches(db.pool, async (_t, tid, id) => (calls.push(`${tid}/${id}`), core()));
  assert.deepEqual(r, { looked: 1, completed: 1, byes: 0 });
  assert.deepEqual(calls, ["315-2026/s1"]);
  const m = await row("s1");
  assert.equal(m.completed, true);
  assert.equal(m.status_state, "post");
  assert.equal(m.status_detail, "Final");
  assert.equal(m.winner_espn_id, "10");
  assert.equal(m.score_display, "6-4 7-6(7-5)");
  assert.equal(m.round, "Qualifying 1st Round");
  assert.equal(m.side1.sets.length, 2);
  assert.equal(m.side1.score, "6-4 7-6(7-5)");
  assert.equal(m.side2.score, "4-6 6-7(5-7)");
  assert.deepEqual(m.side1.names, ["Player 10"]);
  assert.equal(new Date(m.date).toISOString(), "2026-10-05T05:40:00.000Z");
  // and it reads as a result with the right winner on the page
  const [shown] = await tennis.getTennisTournamentMatches("315-2026");
  assert.equal(shown.winner_side, 1);
  assert.equal(tennisMatchStatus(shown, NOW).kind, "result");
});

test("reconcile stores a retirement as Retired, without the unplayed set", async () => {
  await stale("s2");
  await reconcileStaleMatches(db.pool, async () => core({ detail: "Retired", name: "STATUS_RETIRED", sets: { "10": [[6, null], [0, null]], "20": [[4, null], [0, null]] } }));
  const m = await row("s2");
  assert.equal(m.status_detail, "Retired");
  assert.equal(m.score_display, "6-4");
  assert.equal(m.side1.sets.length, 1);
});

test("reconcile leaves alone a match ESPN still calls scheduled, cancelled, postponed, live or without a winner", async () => {
  for (const id of ["a", "b", "c", "d", "e"]) await stale(id);
  const variants: Record<string, CoreCompetition> = {
    a: core({ state: "pre", completed: false, detail: "7/17 - TBD", name: "STATUS_SCHEDULED", sets: { "10": [], "20": [] } }),
    b: core({ state: "post", completed: false, detail: "Canceled", name: "STATUS_CANCELED", winner: null, sets: { "10": [], "20": [] } }),
    c: core({ state: "post", completed: false, detail: "Postponed", name: "STATUS_POSTPONED", sets: { "10": [], "20": [] } }),
    d: core({ state: "in", completed: false, detail: "2nd Set", name: "STATUS_IN_PROGRESS" }),
    e: core({ winner: null }),
  };
  const r = await reconcileStaleMatches(db.pool, async (_t, _tid, id) => variants[id]);
  assert.equal(r.completed, 0);
  for (const id of Object.keys(variants)) {
    const m = await row(id);
    assert.equal(m.completed, false, id);
    assert.equal(m.status_state, "pre", id);
    assert.equal(m.winner_espn_id, null, id);
  }
});

test("reconcile skips a resource whose competitors are not the stored players, and survives a failing fetch", async () => {
  await stale("x");
  await stale("y");
  const logs: string[] = [];
  const r = await reconcileStaleMatches(
    db.pool,
    async (_t, _tid, id) => {
      if (id === "y") throw new Error("ESPN 500");
      return { ...core(), competition: { date: "2026-10-05T05:40Z", competitors: [{ id: "10", winner: true }, { id: "99", winner: false }] } };
    },
    { log: (m) => logs.push(m) }
  );
  assert.equal(r.completed, 0);
  assert.equal(logs.length, 2);
  assert.equal((await row("x")).completed, false);
});

test("reconcile marks a bye 'Bye' and lists hide it", async () => {
  await stale("bye1");
  await reconcileStaleMatches(db.pool, async () => core({ state: "pre", completed: false, name: "STATUS_BYE", detail: "Bye", winner: null }));
  assert.equal((await row("bye1")).status_detail, "Bye");
  assert.equal((await tennis.getTennisTournamentMatches("315-2026")).length, 0);
  assert.equal((await tennis.getTennisPlayerMatches("atp", "10")).length, 0);
  // ESPN's bye resource may carry other competitors than the stored pair (Adana 2026): still a bye
  await stale("bye2");
  await reconcileStaleMatches(db.pool, async () => ({ ...core({ state: "pre", completed: false, name: "STATUS_BYE", detail: "Bye", winner: null }), competition: { competitors: [{ id: "77" }, { id: "88" }] } }));
  assert.equal((await row("bye2")).status_detail, "Bye");
});

test("reconcile only looks at stale rows: recent, future, already-complete and very old ones are not fetched", async () => {
  await put({ id: "fresh", date: new Date(Date.now() - 3 * 3_600_000).toISOString(), p1: "10", p2: "20", winner: null, completed: false, state: "pre", detail: "x" });
  await put({ id: "future", date: new Date(Date.now() + 86_400_000).toISOString(), p1: "10", p2: "20", winner: null, completed: false, state: "pre", detail: "x" });
  await put({ id: "done", date: new Date(Date.now() - 3 * 86_400_000).toISOString(), p1: "10", p2: "20" });
  await put({ id: "ancient", date: "2016-07-17T04:00:00Z", p1: "10", p2: "20", winner: null, completed: false, state: "pre", detail: "7/17 - TBD" });
  const calls: string[] = [];
  const r = await reconcileStaleMatches(db.pool, async (_t, _tid, id) => (calls.push(id), core()));
  assert.deepEqual(r, { looked: 0, completed: 0, byes: 0 });
  assert.deepEqual(calls, []);
});

/* ---------------------------------------------------------------------------------------------------------------- */
/* People on the wrong tour                                                                                          */
/* ---------------------------------------------------------------------------------------------------------------- */

async function people() {
  await db.pool.query(`delete from players`);
  await db.pool.query(
    `insert into players (league, espn_id, name, slug) values
       ('atp','3126','Elena Rybakina','elena-rybakina'), ('wta','3126','Elena Rybakina','elena-rybakina'),
       ('atp','1','Carlos Real','carlos-real'), ('wta','1','Carlos Real','carlos-real'),
       ('atp','2','Both Kinds','both-kinds'), ('wta','2','Both Kinds','both-kinds'),
       ('atp','3','Team Only','team-only'), ('atp','4','No Home','no-home')`
  );
  await put({ id: "r1", tour: "wta", type: "womens-singles", date: "2026-03-01T12:00:00Z", p1: "3126", p2: "90" });
  await put({ id: "r2", tour: "atp", type: "mixed-doubles", date: "2026-01-02T12:00:00Z", p1: "3126", p2: "91", s1: side(["3126"]), s2: side(["91"]) }); // United Cup rubber, filed ATP
  await put({ id: "c1", tour: "atp", type: "mens-singles", date: "2026-03-01T12:00:00Z", p1: "1", p2: "92" });
  await put({ id: "b1", tour: "atp", type: "mens-singles", date: "2026-03-01T12:00:00Z", p1: "2", p2: "93" });
  await put({ id: "b2", tour: "wta", type: "womens-singles", date: "2026-03-02T12:00:00Z", p1: "2", p2: "94" });
  await put({ id: "t1", tour: "atp", type: "team-cup", date: "2026-03-02T12:00:00Z", p1: "3", p2: "95" });
  await put({ id: "n1", tour: "wta", type: "womens-singles", date: "2026-03-02T12:00:00Z", p1: "4", p2: "96" });
}

test("a woman's ATP row points to her WTA page; men, both-kind ids, team-only ids and rows without a home stay", async () => {
  await people();
  assert.deepEqual(await tennis.getTennisHomePlayer("atp", "3126"), { tour: "wta", slug: "elena-rybakina" });
  assert.equal(await tennis.getTennisHomePlayer("wta", "3126"), null, "her own page does not redirect");
  assert.equal(await tennis.getTennisHomePlayer("atp", "1"), null);
  assert.equal(await tennis.getTennisHomePlayer("atp", "2"), null);
  assert.equal(await tennis.getTennisHomePlayer("atp", "3"), null);
  assert.equal(await tennis.getTennisHomePlayer("atp", "4"), null, "no WTA row: no redirect to nothing");
});

test("a man's WTA row points to his ATP page", async () => {
  await people();
  await db.pool.query(`delete from tennis_matches where espn_id = 'c1'`);
  await put({ id: "c2", tour: "atp", type: "mens-singles", date: "2026-03-01T12:00:00Z", p1: "1", p2: "92" });
  assert.deepEqual(await tennis.getTennisHomePlayer("wta", "1"), { tour: "atp", slug: "carlos-real" });
});

test("the sitemap leaves the wrong-tour rows out and keeps everyone else", async () => {
  await people();
  const { sitemapEntries } = await import("../src/lib/sitemap");
  const urls = (await sitemapEntries("tennis")).map((e) => new URL(e.url).pathname);
  assert.ok(!urls.includes("/tennis/atp/players/elena-rybakina"), "Rybakina is not listed under ATP");
  assert.ok(urls.includes("/tennis/wta/players/elena-rybakina"));
  for (const p of ["/tennis/atp/players/carlos-real", "/tennis/atp/players/both-kinds", "/tennis/wta/players/both-kinds", "/tennis/atp/players/team-only"]) assert.ok(urls.includes(p), p);
});
