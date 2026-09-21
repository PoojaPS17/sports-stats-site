// Season win-loss, head-to-head and rivals for a tennis player (interim rules, SQL only):
//  - Davis Cup / United Cup singles are stored under competition_type 'team-cup' (with doubles rubbers under the same
//    type); the singles ones count, told apart by a side of one player. They are not titles.
//  - A walkover (ESPN detail "Walkover", a completed match with a winner and no score) is neither a win nor a loss.
// Sinner 2024 read 71-7 against Wikipedia's 73-6 for exactly these two reasons.
import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { startTestDb, type TestDb } from "./helpers/testDb";

let db: TestDb;
let tennis: typeof import("../src/lib/tennis");
let Draw: typeof import("../src/components/TennisScores").TennisDrawSection;

before(async () => {
  db = await startTestDb();
  tennis = await import("../src/lib/tennis");
  ({ TennisDrawSection: Draw } = await import("../src/components/TennisScores"));
});
after(async () => {
  await (await import("../src/lib/db")).pool.end();
  await db?.stop();
});

const P = "10";
const side = (ids: string[]) => JSON.stringify({ ids, names: ids.map((i) => `Player ${i}`), countries: ids.map(() => null), seed: null, rank: null, score: null, sets: [] });

interface M {
  id: string;
  type: string | null;
  round?: string;
  date: string;
  p1: string;
  p2: string;
  winner: string | null;
  detail?: string;
  ids1?: string[]; // side ids, when they are not just [p1]
  ids2?: string[];
  tournament?: string; // tournament_espn_id; default 't-<year>'
  tname?: string;
  noSides?: boolean; // an early-backfill row: singles only, no side JSON
  completed?: boolean;
}

async function put(m: M) {
  await db.pool.query(
    `insert into tennis_matches (tour, espn_id, tournament_espn_id, tournament_name, round, date, player1_espn_id, player2_espn_id, winner_espn_id,
                                 completed, status_state, status_detail, competition_type, day, side1, side2)
     values ('atp', $1, coalesce($12, 't-' || substr($2, 1, 4)), coalesce($13, 'Some Open'), $3, $2::timestamptz, $4, $5, $6, $7, 'post', $8, $9, $2::date, $10::jsonb, $11::jsonb)`,
    [m.id, m.date, m.round ?? "Round 1", m.p1, m.p2, m.winner, m.completed ?? true, m.detail ?? "Final", m.type, m.noSides ? null : side(m.ids1 ?? [m.p1]), m.noSides ? null : side(m.ids2 ?? [m.p2]), m.tournament ?? null, m.tname ?? null]
  );
}

beforeEach(async () => {
  await db.pool.query(`delete from tennis_matches`);
  await db.pool.query(`delete from players`);
  await db.pool.query(
    `insert into players (league, espn_id, name, slug) values ('atp', '10', 'Player 10', 'player-10'), ('atp', '20', 'Player 20', 'player-20'), ('atp', '30', 'Player 30', 'player-30')`
  );
  await put({ id: "s1", type: "mens-singles", date: "2024-03-01T12:00:00Z", p1: P, p2: "20", winner: P });
  await put({ id: "s2", type: "mens-singles", date: "2024-03-02T12:00:00Z", p1: "30", p2: P, winner: P, detail: "Walkover" }); // not played
  await put({ id: "s3", type: "mens-singles", date: "2024-03-05T12:00:00Z", p1: P, p2: "20", winner: P, round: "Final" }); // a title
  await put({ id: "s4", type: "mens-doubles", date: "2024-04-01T12:00:00Z", p1: P, p2: "20", winner: P, ids1: [P, "40"], ids2: ["20", "50"] });
  await put({ id: "t1", type: "team-cup", date: "2024-11-20T12:00:00Z", p1: P, p2: "20", winner: P, round: "Quarterfinal" }); // Davis Cup singles win
  await put({ id: "t2", type: "team-cup", date: "2024-11-21T12:00:00Z", p1: "30", p2: P, winner: "30", round: "Semifinal" }); // singles loss
  await put({ id: "t3", type: "team-cup", date: "2024-11-22T12:00:00Z", p1: P, p2: "20", winner: P, ids1: [P, "40"], ids2: ["20", "50"] }); // a doubles rubber
  await put({ id: "t4", type: "team-cup", date: "2024-11-24T12:00:00Z", p1: P, p2: "30", winner: P, round: "Final" }); // singles win in the Final tie: not a title
  await put({ id: "w1", type: "mens-singles", date: "2023-05-01T12:00:00Z", p1: P, p2: "20", winner: P, detail: "Walkover" }); // 2023: only a walkover
  await put({ id: "p1", type: "mens-singles", date: "2024-06-01T12:00:00Z", p1: P, p2: "20", winner: null, detail: "Postponed" }); // called off
  await put({ id: "r1", type: "mens-singles", date: "2024-06-10T12:00:00Z", p1: "20", p2: P, winner: "20", detail: "Retired" }); // a retirement is a result
});

test("season record: team-cup singles count, walkovers, doubles and rubbers in doubles do not, and a Davis Cup Final rubber is no title", async () => {
  const r = await tennis.getTennisPlayerSeasonRecords("atp", P);
  // 2024: wins s1, s3, t1, t4 = 4; losses t2, r1 = 2; one title (s3)
  assert.deepEqual(r, [{ season: 2024, wins: 4, losses: 2, titles: 1 }]);
});

test("a season with only a walkover has no record row at all", async () => {
  const seasons = (await tennis.getTennisPlayerSeasonRecords("atp", P)).map((x) => x.season);
  assert.ok(!seasons.includes(2023));
});

test("the opponent's record is the mirror image: a walkover is not their loss", async () => {
  const r = await tennis.getTennisPlayerSeasonRecords("atp", "20");
  // 2024: loses s1, s3, t1 (singles); wins r1. t3 is a doubles rubber, s4 doubles.
  assert.deepEqual(r, [{ season: 2024, wins: 1, losses: 3, titles: 0 }]);
});

test("head-to-head lists team-cup singles and leaves out walkovers and doubles", async () => {
  const ids = (await tennis.getTennisHeadToHead("atp", P, "20")).map((m) => m.espn_id).sort();
  assert.deepEqual(ids, ["p1", "r1", "s1", "s3", "t1"].sort());
});

test("rivals count the same matches: team-cup singles in, walkovers and doubles out", async () => {
  const rivals = await tennis.getTennisPlayerRivals("atp", P);
  const by = Object.fromEntries(rivals.map((r) => [r.espn_id, [r.matches, r.wins]]));
  // vs 20: s1 W, s3 W, t1 W, r1 L (walkover w1, doubles s4/t3 and the postponed p1 are out) -> 4 played, 3 won
  // vs 30: t2 L, t4 W (walkover s2 out) -> 2 played, 1 won
  assert.deepEqual(by, { "20": [4, 3], "30": [2, 1] });
});

test("an early-backfill row with no side JSON is still a singles match", async () => {
  await put({ id: "b1", type: null, date: "2019-09-01T12:00:00Z", p1: P, p2: "20", winner: P, noSides: true });
  await put({ id: "b2", type: "mens-singles", date: "2019-09-02T12:00:00Z", p1: "20", p2: P, winner: "20", noSides: true });
  const r = await tennis.getTennisPlayerSeasonRecords("atp", P);
  assert.deepEqual(r.find((x) => x.season === 2019), { season: 2019, wins: 1, losses: 1, titles: 0 });
});

/* ---- a team cup is not a singles or doubles draw ---- */

test("a team-cup event has a label for its section, and no champions listed from its Final rubbers", async () => {
  await db.pool.query(`delete from tennis_matches`);
  await put({ id: "t4", type: "team-cup", date: "2024-11-24T12:00:00Z", p1: P, p2: "30", winner: P, round: "Final" });
  await db.pool.query(
    `insert into tennis_tournaments (espn_id, tour, tournament_id, season, name, start_date, end_date) values ('t-2024', 'atp', 't', 2024, 'Davis Cup Finals', '2024-11-19T05:00:00Z', '2024-11-25T04:59:00Z')`
  );
  const t = await tennis.getTennisTournament("t-2024");
  assert.deepEqual(t?.champions, [], "no singles/doubles champion from a team event's Final tie");
  const matches = await tennis.getTennisTournamentMatches("t-2024");
  const html = renderToStaticMarkup(createElement(Draw, { type: "team-cup", matches }));
  assert.match(html, />Team Cup</);
  assert.equal(tennis.COMPETITION_LABEL["team-cup"], "Team Cup");
});

/* ---- which team events count ---- */

// ESPN files these as competition_type 'team-cup' (feed samples 2021-2025): Davis Cup (ids 810, 862, 928, 968...), ATP Cup
// (827-838, 878), Billie Jean King Cup (863, 929, 967) and the Laver Cup (840). The ATP and WTA count the first three in
// a player's record; the Laver Cup is an exhibition and neither tour nor Wikipedia counts it. United Cup (918) is typed
// 'mixed-doubles' for every rubber, its singles ones with a one-player side.
const record = async () => (await tennis.getTennisPlayerSeasonRecords("atp", P)).find((r) => r.season === 2024);
const h2hIds = async () => (await tennis.getTennisHeadToHead("atp", P, "20")).map((m) => m.espn_id).sort();
const rivalRow = async () => (await tennis.getTennisPlayerRivals("atp", P)).find((r) => r.espn_id === "20");

test("Laver Cup singles (id 840, or the name when the id is missing) are in no record, head-to-head or rival count", async () => {
  const before = [await record(), await h2hIds(), await rivalRow()];
  await put({ id: "l1", type: "team-cup", date: "2024-09-21T12:00:00Z", p1: P, p2: "20", winner: P, round: "Final", tournament: "840-2024", tname: "Laver Cup" });
  await put({ id: "l2", type: "team-cup", date: "2025-09-20T12:00:00Z", p1: "20", p2: P, winner: "20", tournament: "840-2025", tname: "Laver Cup" });
  await put({ id: "l3", type: "team-cup", date: "2024-09-22T12:00:00Z", p1: P, p2: "20", winner: "20", tournament: "x-unknown", tname: "Laver Cup" }); // name fallback
  assert.deepEqual([await record(), await h2hIds(), await rivalRow()], before);
  assert.equal((await tennis.getTennisPlayerSeasonRecords("atp", P)).some((r) => r.season === 2025), false, "a Laver-Cup-only season has no row");
});

test("Davis Cup, ATP Cup and Billie Jean King Cup singles count, one-player sides only", async () => {
  const before = await record();
  await put({ id: "d1", type: "team-cup", date: "2024-11-20T12:00:00Z", p1: P, p2: "30", winner: P, round: "Quarterfinal", tournament: "862-2024", tname: "Davis Cup Finals" });
  await put({ id: "d2", type: "team-cup", date: "2024-02-02T12:00:00Z", p1: "30", p2: P, winner: "30", tournament: "968-2024", tname: "Davis Cup World Group I" });
  await put({ id: "d3", type: "team-cup", date: "2024-01-02T12:00:00Z", p1: P, p2: "30", winner: P, tournament: "878-2024", tname: "ATP Cup" });
  await put({ id: "d4", type: "team-cup", date: "2024-11-13T12:00:00Z", p1: P, p2: "30", winner: P, tournament: "967-2024", tname: "Billie Jean King Cup Play-offs" });
  assert.deepEqual(await record(), { season: 2024, wins: before!.wins + 3, losses: before!.losses + 1, titles: before!.titles });
});

test("United Cup singles (typed mixed-doubles with one-player sides) count; a real mixed-doubles pair does not", async () => {
  const before = await record();
  await put({ id: "u1", type: "mixed-doubles", date: "2024-01-03T12:00:00Z", p1: P, p2: "20", winner: "20", round: "Group Stage", tournament: "918-2024", tname: "United Cup" });
  await put({ id: "u2", type: "mixed-doubles", date: "2024-01-04T12:00:00Z", p1: P, p2: "20", winner: P, tournament: "someopen-2024", ids1: [P, "40"], ids2: ["20", "50"] });
  assert.deepEqual(await record(), { season: 2024, wins: before!.wins, losses: before!.losses + 1, titles: before!.titles });
});

/* ---- fix round 2: a team-event rubber is never a title or a champion ---- */

// ESPN labels the rubbers of a United Cup final tie "Final" (Hurkacz vs Zverev 2024-01-07, Fritz vs Hurkacz 2025-01-05, Swiatek vs
// Kerber 2024-01-06) and types them 'mixed-doubles' with one-player sides. Winning one is not winning the tournament.
test("a United Cup Final rubber win adds a win, not a title; a genuine singles final still does", async () => {
  const before = await record();
  await put({ id: "uf", type: "mixed-doubles", date: "2024-01-07T12:00:00Z", p1: P, p2: "20", winner: P, round: "Final", tournament: "918-2024", tname: "United Cup" });
  assert.deepEqual(await record(), { season: 2024, wins: before!.wins + 1, losses: before!.losses, titles: before!.titles });
  // positive control: a tour singles final (mens-singles, no side ids other than one player) is a title
  await put({ id: "tf", type: "mens-singles", date: "2024-10-06T12:00:00Z", p1: P, p2: "30", winner: P, round: "Final", tournament: "5-2024", tname: "Some Masters" });
  assert.deepEqual(await record(), { season: 2024, wins: before!.wins + 2, losses: before!.losses, titles: before!.titles + 1 });
  // and a lost United Cup final rubber is a loss with no effect on titles
  await put({ id: "ul", type: "mixed-doubles", date: "2024-01-06T12:00:00Z", p1: "20", p2: P, winner: "20", round: "Final", tournament: "918-2024", tname: "United Cup" });
  assert.deepEqual(await record(), { season: 2024, wins: before!.wins + 2, losses: before!.losses + 1, titles: before!.titles + 1 });
});

test("a Slam mixed-doubles final (two-player sides) is not in a player's singles record at all", async () => {
  const before = await record();
  await put({ id: "mx", type: "mixed-doubles", date: "2024-07-14T12:00:00Z", p1: P, p2: "20", winner: P, round: "Final", tournament: "188-2024", tname: "Wimbledon", ids1: [P, "40"], ids2: ["20", "50"] });
  assert.deepEqual(await record(), before);
});

test("the tournament page lists no champion from a team event's final rubbers (United Cup), but still lists a Slam mixed-doubles champion pair", async () => {
  await db.pool.query(`delete from tennis_matches`);
  await db.pool.query(
    `insert into tennis_tournaments (espn_id, tour, tournament_id, season, name, start_date, end_date) values
       ('918-2024', 'atp', '918', 2024, 'United Cup', '2024-01-01T05:00:00Z', '2024-01-08T04:59:00Z'),
       ('188-2024', 'both', '188', 2024, 'Wimbledon', '2024-07-01T04:00:00Z', '2024-07-15T03:59:00Z')`
  );
  await put({ id: "uc1", type: "mixed-doubles", date: "2024-01-07T12:00:00Z", p1: P, p2: "20", winner: P, round: "Final", tournament: "918-2024", tname: "United Cup" });
  await put({ id: "uc2", type: "mixed-doubles", date: "2024-01-07T13:00:00Z", p1: "30", p2: "40", winner: "30", round: "Final", tournament: "918-2024", tname: "United Cup" });
  await put({ id: "uc3", type: "mixed-doubles", date: "2024-01-07T14:00:00Z", p1: P, p2: "20", winner: P, round: "Final", tournament: "918-2024", tname: "United Cup", ids1: [P, "40"], ids2: ["20", "50"] }); // the tie's real mixed doubles rubber
  await put({ id: "wm", type: "mixed-doubles", date: "2024-07-14T12:00:00Z", p1: P, p2: "20", winner: P, round: "Final", tournament: "188-2024", tname: "Wimbledon", ids1: [P, "40"], ids2: ["20", "50"] });
  await put({ id: "ws", type: "mens-singles", date: "2024-07-14T14:00:00Z", p1: P, p2: "30", winner: P, round: "Final", tournament: "188-2024", tname: "Wimbledon" });
  const united = await tennis.getTennisTournament("918-2024");
  assert.deepEqual(united?.champions, [], "a team event has no per-draw champions: not from its singles rubbers, nor from its mixed-doubles rubber");
  const slam = await tennis.getTennisTournament("188-2024");
  assert.deepEqual(slam?.champions.map((c) => c.competition_type), ["mens-singles", "mixed-doubles"], "a real Slam mixed-doubles pair is");
});

/* ---- fix round 3: a row with no draw type (the early Slam backfill) is a singles match, and its Final is a title ---- */

test("rows with a NULL competition_type and round Final count as titles, one per row (with and without side JSON)", async () => {
  await put({ id: "n1", type: null, date: "2018-09-08T12:00:00Z", p1: P, p2: "20", winner: P, round: "Final", tournament: "189-2018", tname: "US Open", noSides: true });
  await put({ id: "n2", type: null, date: "2018-07-15T12:00:00Z", p1: "30", p2: P, winner: P, round: "Final", tournament: "188-2018", tname: "Wimbledon", noSides: true });
  await put({ id: "n3", type: null, date: "2018-01-27T12:00:00Z", p1: P, p2: "20", winner: P, round: "Final", tournament: "154-2018", tname: "Australian Open" }); // typeless but with sides
  await put({ id: "n4", type: null, date: "2018-06-09T12:00:00Z", p1: P, p2: "30", winner: "30", round: "Final", tournament: "172-2018", tname: "French Open", noSides: true }); // lost final: no title
  const r = (await tennis.getTennisPlayerSeasonRecords("atp", P)).find((x) => x.season === 2018);
  assert.deepEqual(r, { season: 2018, wins: 3, losses: 1, titles: 3 });
});

test("the champions of a tournament whose rows have no draw type are not hidden by the team-event check", async () => {
  await db.pool.query(`delete from tennis_matches`);
  await db.pool.query(`insert into tennis_tournaments (espn_id, tour, tournament_id, season, name) values ('189-2018', 'both', '189', 2018, 'US Open')`);
  await put({ id: "n5", type: null, date: "2018-09-08T12:00:00Z", p1: P, p2: "20", winner: P, round: "Final", tournament: "189-2018", tname: "US Open" }); // sides present, no type
  const t = await tennis.getTennisTournament("189-2018");
  assert.equal(t?.champions.length, 1, "the null-type Final still lists its winner");
});
