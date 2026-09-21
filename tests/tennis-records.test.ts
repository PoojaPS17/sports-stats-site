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
  noSides?: boolean; // an early-backfill row: singles only, no side JSON
  completed?: boolean;
}

async function put(m: M) {
  await db.pool.query(
    `insert into tennis_matches (tour, espn_id, tournament_espn_id, tournament_name, round, date, player1_espn_id, player2_espn_id, winner_espn_id,
                                 completed, status_state, status_detail, competition_type, day, side1, side2)
     values ('atp', $1, 't-' || substr($2, 1, 4), 'Some Open', $3, $2::timestamptz, $4, $5, $6, $7, 'post', $8, $9, $2::date, $10::jsonb, $11::jsonb)`,
    [m.id, m.date, m.round ?? "Round 1", m.p1, m.p2, m.winner, m.completed ?? true, m.detail ?? "Final", m.type, m.noSides ? null : side(m.ids1 ?? [m.p1]), m.noSides ? null : side(m.ids2 ?? [m.p2])]
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
