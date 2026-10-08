import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { startTestDb, type TestDb } from "./helpers/testDb";
import { brinkOf, brinkSentence, canClaimMilestone, nextTarget, selectBrink, BRINK_RULES, type BrinkCandidate } from "../src/lib/brink";

// "On the brink": milestones are season-scoped, claimed only from a season that is complete and still being played,
// and never from a cricket career (the archive is partial). Hand-computed figures throughout.

let db: TestDb;
let readBrinkCandidates: typeof import("../src/lib/brinkData").readBrinkCandidates;
let activeSeason: typeof import("../src/lib/brinkData").activeSeason;
const q = (sql: string, args: unknown[] = []) => db.pool.query(sql, args);

const cand = (o: Partial<BrinkCandidate> & { value: number }): BrinkCandidate => ({ league: "mls", season: 2026, stat: "goals", playerId: "p", name: "P", slug: "p", teamName: "T", ...o });

test("the next round number: multiples of the step, never below the first milestone", () => {
  const goals = BRINK_RULES.mls![0];
  assert.equal(nextTarget(goals, 3), 10);
  assert.equal(nextTarget(goals, 9), 10);
  assert.equal(nextTarget(goals, 10), 15);
  assert.equal(nextTarget(goals, 19), 20);
  const pass = BRINK_RULES.nfl![0];
  assert.equal(nextTarget(pass, 960), 1000);
  assert.equal(nextTarget(pass, 1000), 2000);
});

test("only a figure within reach of a round number is on the brink", () => {
  assert.equal(brinkOf(cand({ value: 9 }))?.gap, 1);
  assert.equal(brinkOf(cand({ value: 12 }))?.target, 15); // 3 short: the goals limit
  assert.equal(brinkOf(cand({ value: 11 })), null); // 4 short
  assert.equal(brinkOf(cand({ value: 5 })), null); // below the first milestone's reach
  assert.equal(brinkOf(cand({ stat: "assists" as never, value: 9 })), null); // assists are not claimed
  assert.equal(brinkOf(cand({ league: "nfl", stat: "passing_yards", value: 850 }))?.gap, 150);
  assert.equal(brinkOf(cand({ league: "nfl", stat: "passing_yards", value: 849 })), null);
  assert.equal(brinkOf(cand({ league: "nfl", stat: "rushing_yards", value: 899 })), null);
  assert.equal(brinkOf(cand({ league: "nfl", stat: "rushing_yards", value: 900 }))?.gap, 100);
  assert.equal(brinkOf(cand({ league: "nfl", stat: "goals" as never, value: 9 })), null); // a figure the league does not carry
});

test("a cricket candidate never becomes a milestone, whatever the career figure", () => {
  assert.equal(canClaimMilestone("odi"), false);
  assert.equal(canClaimMilestone("test"), false);
  assert.equal(canClaimMilestone("ipl"), false);
  assert.equal(canClaimMilestone("mls"), true);
  for (const league of ["odi", "test", "t20i", "ipl", "wodi"] as const) {
    assert.deepEqual(selectBrink([cand({ league, stat: "goals", value: 9 }), cand({ league, stat: "goals" as never, value: 9_990 })]), []);
  }
});

test("selection: closest first, two per league, four in all, one line per player and figure", () => {
  const c = [
    cand({ playerId: "a", name: "Ann", value: 9 }), // 1 of 3
    cand({ playerId: "a", name: "Ann", value: 9 }), // the same player twice
    cand({ playerId: "b", name: "Bob", value: 8 }), // 2 of 3
    cand({ playerId: "c", name: "Cy", value: 7 }), // 3 of 3, a third from MLS
    cand({ league: "epl", playerId: "d", name: "Dee", value: 14 }), // 1 of 3
    cand({ league: "nfl", playerId: "e", name: "Eve", stat: "receiving_yards", value: 950 }), // 50 of 100
    cand({ league: "epl", playerId: "f", name: "Fay", value: 13 }), // a third from the EPL
  ];
  const out = selectBrink(c);
  // Dee and Ann are both 1 of 3; the bigger milestone (15) goes first. Eve is 50 of 100. Bob and Cy (MLS goals) and Fay
  // (EPL goals) are the same figure in a league already shown: each league's goals are one line.
  assert.deepEqual(out.map((i) => i.name), ["Dee", "Ann", "Eve"]);
  assert.ok(!out.some((i) => i.name === "Cy" || i.name === "Fay" || i.name === "Bob"));
  // Four lines at most, two per league.
  const many = selectBrink([
    cand({ playerId: "1", name: "A", value: 9 }), cand({ playerId: "2", name: "B", league: "nfl", stat: "passing_yards", value: 990 }), cand({ playerId: "3", name: "C", league: "epl", value: 9 }),
    cand({ playerId: "4", name: "D", league: "nfl", stat: "rushing_yards", value: 990 }), cand({ playerId: "5", name: "E", league: "laliga", value: 9 }), cand({ playerId: "6", name: "F", league: "laliga", value: 14 }),
  ]);
  assert.equal(many.length, 4);
  assert.ok(many.every((i) => many.filter((j) => j.league === i.league).length <= 2));
});

test("the sentence says the figure, the season scope and the distance", () => {
  const i = brinkOf(cand({ value: 18, name: "Petar Musa" }))!;
  assert.equal(i.target, 20);
  assert.equal(brinkSentence(i, "the 2026 MLS regular season"), "18 goals in the 2026 MLS regular season, 2 short of 20.");
  const n = brinkOf(cand({ league: "nfl", stat: "passing_yards", value: 960 }))!;
  assert.equal(brinkSentence(n, "the 2026 NFL regular season"), "960 passing yards in the 2026 NFL regular season, 40 short of 1,000.");
});

const hours = (h: number) => `now() - interval '${h} hours'`;
async function game(league: string, id: string, hoursAgo: number, o: { done?: boolean; seasonType?: number; home?: string; away?: string } = {}) {
  await q(
    `insert into games (league, espn_id, date, name, home_team_espn_id, away_team_espn_id, season_year, completed, season_type, home_score, away_score)
     values ($1, $2, ${hours(hoursAgo)}, $2, $3, $4, 2026, $5, $6, 1, 0)`,
    [league, id, o.home ?? "1", o.away ?? "2", o.done ?? true, o.seasonType ?? null]
  );
}
const row = (league: string, gameId: string, playerId: string, teamId: string, stats: object) =>
  q(`insert into player_game_stats (league, game_espn_id, player_espn_id, team_espn_id, stats) values ($1, $2, $3, $4, $5)`, [league, gameId, playerId, teamId, JSON.stringify(stats)]);
const soccer = (g: number, a = 0) => ({ match: { APP: "1", SUBIN: "0", G: String(g), A: String(a) } });
const player = (league: string, id: string, name: string) => q(`insert into players (league, espn_id, team_espn_id, name, slug) values ($1, $2, '1', $3, $4)`, [league, id, name, name.toLowerCase().replace(/ /g, "-")]);

before(async () => {
  db = await startTestDb();
  ({ readBrinkCandidates, activeSeason } = await import("../src/lib/brinkData"));
  for (const l of ["mls", "epl", "laliga", "seriea", "nfl", "odi"]) await q(`insert into teams (league, espn_id, name, slug) values ($1,'1','One','one'), ($1,'2','Two','two')`, [l]);

  // MLS: three finished games and one to come. Ann 3+3+3 = 9 goals (1 short of 10); Bob 3+1+1 = 5; Dee 4+4+4 = 12
  // (3 short of 15); Eve 8 assists (not claimed); Cy 10 goals (5 short of 15, not on the brink).
  for (const [id, h] of [["m1", 72], ["m2", 48], ["m3", 24]] as const) await game("mls", id, h);
  await game("mls", "m4", -48, { done: false });
  for (const [id, n] of [["ann", "Ann Scorer"], ["bob", "Bob Scorer"], ["dee", "Dee Scorer"], ["eve", "Eve Maker"], ["cy", "Cy Scorer"]] as const) await player("mls", id, n);
  await row("mls", "m1", "ann", "1", soccer(3)); await row("mls", "m2", "ann", "1", soccer(3)); await row("mls", "m3", "ann", "1", soccer(3));
  await row("mls", "m1", "bob", "1", soccer(3)); await row("mls", "m2", "bob", "1", soccer(1)); await row("mls", "m3", "bob", "1", soccer(1));
  await row("mls", "m1", "dee", "2", soccer(4)); await row("mls", "m2", "dee", "2", soccer(4)); await row("mls", "m3", "dee", "2", soccer(4));
  await row("mls", "m1", "eve", "2", soccer(0, 3)); await row("mls", "m2", "eve", "2", soccer(0, 3)); await row("mls", "m3", "eve", "2", soccer(0, 2));
  await row("mls", "m1", "cy", "1", soccer(4)); await row("mls", "m2", "cy", "1", soccer(3)); await row("mls", "m3", "cy", "1", soccer(3));
  await row("mls", "m4", "ann", "1", soccer(5)); // a game not finished: counts nowhere

  // EPL: the same 9-goal player, but one finished game has no stored box score, so the totals are not whole.
  await game("epl", "e1", 72); await game("epl", "e2", 48); await game("epl", "e3", 24); await game("epl", "e4", -48, { done: false });
  await player("epl", "epa", "Epl Nine");
  await row("epl", "e1", "epa", "1", soccer(3)); await row("epl", "e2", "epa", "1", soccer(3));

  // La Liga: whole, but over (nothing left to play). Serie A: whole and unfinished, but quiet for 60 days.
  await game("laliga", "l1", 48); await game("laliga", "l2", 24);
  await player("laliga", "lla", "La Nine"); await row("laliga", "l1", "lla", "1", soccer(5)); await row("laliga", "l2", "lla", "1", soccer(4));
  await game("seriea", "s1", 24 * 61); await game("seriea", "s2", -48, { done: false });
  await player("seriea", "sa", "Serie Nine"); await row("seriea", "s1", "sa", "1", soccer(9));

  // NFL (season_type 2 = regular): Quinn throws 500 + 460 = 960 yards (40 short of 1,000); Rex runs 300 + 250 = 550.
  await game("nfl", "n1", 240, { seasonType: 2 }); await game("nfl", "n2", 72, { seasonType: 2 }); await game("nfl", "n3", -96, { seasonType: 2, done: false });
  await player("nfl", "quinn", "Quinn Thrower"); await player("nfl", "rex", "Rex Runner");
  await row("nfl", "n1", "quinn", "1", { passing: { YDS: "500" } }); await row("nfl", "n2", "quinn", "1", { passing: { YDS: "460" } });
  await row("nfl", "n1", "rex", "2", { rushing: { YDS: "300" } }); await row("nfl", "n2", "rex", "2", { rushing: { YDS: "250" } });

  // ODI (partial archive): a batter with 9,990 runs in the games we hold, in a league that is being played now.
  await game("odi", "o1", 48); await game("odi", "o2", -48, { done: false });
  await player("odi", "kohli", "Career Batter");
  await row("odi", "o1", "kohli", "1", { batting: { runs: 9990, ballsFaced: 10000 } });
});
after(async () => { await db?.stop(); });

test("a season being played, whole and recent, is read; one that is over, short of a box score or quiet is not", async () => {
  assert.equal(await activeSeason("mls"), 2026);
  assert.equal(await activeSeason("nfl"), 2026);
  assert.equal(await activeSeason("epl"), null, "a finished game without a box score");
  assert.equal(await activeSeason("laliga"), null, "no game left to play");
  assert.equal(await activeSeason("seriea"), null, "no finished game in 30 days");
});

test("the candidates are the season totals of the leaders board, and nothing else", async () => {
  const c = await readBrinkCandidates();
  const key = (x: BrinkCandidate) => `${x.league}:${x.stat}:${x.name}:${x.value}`;
  const got = c.map(key).sort();
  assert.deepEqual(got, [
    "mls:goals:Ann Scorer:9", "mls:goals:Bob Scorer:5", "mls:goals:Cy Scorer:10", "mls:goals:Dee Scorer:12",
    "nfl:passing_yards:Quinn Thrower:960", "nfl:rushing_yards:Rex Runner:550",
  ].sort());
  assert.ok(!c.some((x) => x.league === "epl" || x.league === "laliga" || x.league === "seriea"));
});

test("a partial cricket career produces no milestone, even 10 runs from 10,000", async () => {
  const c = await readBrinkCandidates();
  assert.ok(!c.some((x) => x.league === "odi" || x.name.includes("Career Batter")));
  assert.deepEqual(selectBrink(c).filter((i) => i.league === "odi"), []);
});

test("the milestones shown, from the stored rows", async () => {
  const out = selectBrink(await readBrinkCandidates());
  // Closeness (gap over the limit): Quinn 40/150 = .27, Ann 1/3 = .33. Dee (3 short of 15) is MLS goals too, and Ann
  // already stands for them. Eve's 8 assists are not a claim the module makes.
  assert.deepEqual(out.map((i) => `${i.name}:${i.gap}:${i.target}`), ["Quinn Thrower:40:1000", "Ann Scorer:1:10"]);
});

test("the module renders each milestone with its scope and a player link, and nothing when there are none", async () => {
  const { OnTheBrinkView } = await import("../src/components/home/OnTheBrink");
  assert.equal(renderToStaticMarkup(OnTheBrinkView({ items: [] })), "");
  const html = renderToStaticMarkup(OnTheBrinkView({ items: selectBrink(await readBrinkCandidates()) }));
  assert.match(html, /On the brink/);
  assert.match(html, /9 goals in the 2026 MLS regular season, 1 short of 10\./);
  assert.match(html, /href="\/mls\/players\/ann-scorer"/);
  assert.doesNotMatch(html, /assists/);
  assert.match(html, /960 passing yards in the 2026 NFL regular season, 40 short of 1,000\./);
  assert.match(html, /home-firstvisit/);
  assert.doesNotMatch(html, /Career Batter|<h1/);
});
