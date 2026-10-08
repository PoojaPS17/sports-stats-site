import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { startTestDb, type TestDb } from "./helpers/testDb";
import { ageLabel, competitionLabel, playerGameFacts, selectBest, BALLS_NOT_RECORDED, type BestFact, type PlayerGameRow } from "../src/lib/bestOfWeek";

// "Best of this week" against a real database: which stored results clear their bar inside the seven days, what the
// sentence says, where it links, and how a hundred with no recorded balls is marked. Expectations are hand-computed
// from the rows below.

let db: TestDb;
let readBestFacts: typeof import("../src/lib/bestOfWeekData").readBestFacts;
const q = (sql: string, args: unknown[] = []) => db.pool.query(sql, args);
const ago = (h: number) => `now() - interval '${h} hours'`;

async function game(league: string, id: string, hoursAgo: number, home: string, away: string, completed = true) {
  await q(
    `insert into games (league, espn_id, date, name, home_team_espn_id, away_team_espn_id, season_year, completed, status_detail, home_score, away_score)
     values ($1,$2,${ago(hoursAgo)},$2,$3,$4,2026,$5,'Final',1,0)`,
    [league, id, home, away, completed]
  );
}
const row = (league: string, game: string, player: string, team: string, stats: object) =>
  q(`insert into player_game_stats (league, game_espn_id, player_espn_id, team_espn_id, stats) values ($1,$2,$3,$4,$5)`, [league, game, player, team, JSON.stringify(stats)]);

before(async () => {
  db = await startTestDb();
  ({ readBestFacts } = await import("../src/lib/bestOfWeekData"));
  await q(
    `insert into teams (league, espn_id, name, slug, abbreviation) values
       ('epl','1','Arsenal','arsenal','ARS'), ('epl','2','Chelsea','chelsea','CHE'),
       ('nba','31','Boston Celtics','boston-celtics','BOS'), ('nba','32','Miami Heat','miami-heat','MIA'),
       ('nfl','41','New York Giants','new-york-giants','NYG'), ('nfl','42','New York Jets','new-york-jets','NYJ'),
       ('odi','51','Coral Coast','coral-coast','COR'), ('odi','52','Highveld','highveld','HIG')`
  );
  await q(
    `insert into players (league, espn_id, name, slug) values
       ('epl','e1','Sam Strike','sam-strike'), ('epl','e2','Dan Duo','dan-duo'), ('epl','e3','Old Hat','old-hat'),
       ('nba','n1','Ace Scorer','ace-scorer'), ('nba','n2','Near Miss','near-miss'), ('nba','n3','Never Played','never-played'),
       ('nfl','f1','Big Arm','big-arm'), ('nfl','f2','Short Arm','short-arm'),
       ('odi','p1','A. Rahman','a-rahman')`
  );
  // Football: a hat-trick 3 days ago, two goals the same day, four goals 10 days ago (outside the week), a "--" cell.
  await game("epl", "g1", 72, "1", "2");
  await game("epl", "g0", 240, "1", "2");
  await game("epl", "g2", 24, "2", "1");
  await row("epl", "g1", "e1", "1", { match: { G: "3" } });
  await row("epl", "g1", "e2", "2", { match: { G: "2" } });
  await row("epl", "g0", "e3", "1", { match: { G: "4" } });
  await row("epl", "g2", "e2", "2", { match: { G: "--" } });
  // NBA: 41 and 39 two days ago; 55 in a game that never finished.
  await game("nba", "b1", 48, "31", "32");
  await game("nba", "b2", 24, "31", "32", false);
  await row("nba", "b1", "n1", "31", { box: { MIN: "36", PTS: "41" } });
  await row("nba", "b1", "n2", "32", { box: { MIN: "36", PTS: "39" } });
  await row("nba", "b2", "n3", "31", { box: { MIN: "30", PTS: "55" } });
  // NFL: 412 and 399 passing yards five days ago.
  await game("nfl", "x1", 120, "41", "42");
  await row("nfl", "x1", "f1", "41", { passing: { YDS: "412" } });
  await row("nfl", "x1", "f2", "42", { passing: { YDS: "399" } });
  // Cricket: a hundred four days ago with no balls faced recorded.
  await game("odi", "m1", 96, "51", "52");
  await row("odi", "m1", "p1", "51", { batting: { runs: 104, notOut: false } });
});

after(async () => {
  await (await import("../src/lib/db")).pool.end();
  await db.stop();
});

test("only results that clear their bar inside the seven days, worded and linked as stored", async () => {
  const facts = await readBestFacts();
  const texts = facts.map((f) => f.text).sort();
  assert.deepEqual(texts, [
    "A. Rahman made 104 for Coral Coast against Highveld.",
    "Ace Scorer scored 41 points for Boston Celtics against Miami Heat.",
    "Big Arm threw for 412 yards for New York Giants against New York Jets.",
    "Sam Strike scored 3 goals for Arsenal against Chelsea.",
  ]);
  const by = (needle: string) => facts.find((f) => f.text.includes(needle))!;
  assert.equal(by("Sam Strike").href, "/epl/games/g1");
  assert.equal(by("Ace Scorer").href, "/nba/games/b1");
  assert.equal(by("Big Arm").href, "/nfl/games/x1");
  assert.equal(by("A. Rahman").href, "/odi/games/m1");
  assert.equal(by("A. Rahman").note, BALLS_NOT_RECORDED, "a hundred with no balls faced says so");
  assert.equal(by("Sam Strike").note, undefined);
  assert.equal(by("Sam Strike").league, "epl");
});

test("the cards: all four, one per sport, strongest first, each text holds its figure", async () => {
  const cards = selectBest(await readBestFacts(), new Date());
  assert.equal(cards.length, 4);
  assert.equal(new Set(cards.map((c) => c.sport)).size, 4);
  for (let i = 1; i < cards.length; i++) assert.ok(cards[i - 1].weight >= cards[i].weight);
  assert.ok(cards.every((c) => c.text.includes(c.figure) && c.href.startsWith("/")));
  assert.deepEqual(cards.map((c) => competitionLabel(c)).sort(), ["NBA", "NFL", "ODI Internationals", "Premier League"]);
});

test("the week's edge: a fact eight days old is not a card, a six-day-old one is", () => {
  const now = new Date("2026-10-08T12:00:00Z");
  const rowOf = (daysAgo: number): PlayerGameRow => ({ league: "epl", gameId: `g${daysAgo}`, playerId: "p", playerName: "X", teamName: "A", opponentName: "B", value: 3, kind: "hat-trick", at: new Date(now.getTime() - daysAgo * 86_400_000) });
  const cards = selectBest(playerGameFacts([rowOf(8), rowOf(6)]), now);
  assert.deepEqual(cards.map((c) => c.id), ["hat-trick:epl:g6:p"]);
});

test("below the bar is not a fact", () => {
  const at = new Date();
  const mk = (kind: PlayerGameRow["kind"], value: number): PlayerGameRow => ({ league: "x", gameId: "g", playerId: "p", playerName: "N", teamName: "A", opponentName: "B", value, kind, at });
  assert.deepEqual(playerGameFacts([mk("hat-trick", 2), mk("forty-points", 39), mk("passing-yards", 399), mk("hat-trick", Number.NaN)]), []);
  assert.equal(playerGameFacts([mk("hat-trick", 3), mk("forty-points", 40), mk("passing-yards", 400)]).length, 3);
});

test("age labels are elapsed time", () => {
  const now = new Date("2026-10-08T12:00:00Z");
  const at = (h: number) => new Date(now.getTime() - h * 3_600_000).toISOString();
  assert.equal(ageLabel(at(5), now), "In the last 24 hours");
  assert.equal(ageLabel(at(24), now), "1 day ago");
  assert.equal(ageLabel(at(71), now), "2 days ago");
  assert.equal(ageLabel(at(-1), now), "In the last 24 hours");
});

test("an empty database gives no cards", async () => {
  for (const t of ["player_game_stats", "games"]) await q(`delete from ${t}`);
  assert.deepEqual(selectBest(await readBestFacts(), new Date()) as BestFact[], []);
});
