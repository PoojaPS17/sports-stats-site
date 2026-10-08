import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { startTestDb, type TestDb } from "./helpers/testDb";
import {
  bestBattingSplit,
  bestBowlingSplit,
  cricketInsightLine,
  cricketInsights,
  MIN_SPLIT_INNINGS,
  primaryDiscipline,
  type CricketSplitInnings,
} from "../src/lib/tryCard";

// The "Try a name" card against a real database: every figure is checked against numbers worked out by hand from the
// seeded rows, and against the readers the player's own page uses. Dates are relative to now so the week's window is real.

let db: TestDb;
let loadTryCard: typeof import("../src/lib/tryCardLoader").loadTryCard;
let readTrySuggestions: typeof import("../src/lib/tryCardLoader").readTrySuggestions;
let GET: (request: Request) => Promise<Response>;
let queries: typeof import("../src/lib/queries");
const q = (sql: string, args: unknown[] = []) => db.pool.query(sql, args);

const DAY = 86_400_000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY).toISOString();

const split = (label: string, o: Partial<CricketSplitInnings> = {}): CricketSplitInnings => ({ label, inningsBatted: 0, dismissals: 0, runs: 0, inningsBowled: 0, wickets: 0, conceded: 0, ...o });

// --- pure -------------------------------------------------------------------------------------------------------------

test("the best opponent needs five innings: a hundred and fifty in one match is not a record against a side", () => {
  const rows = [
    split("One-off", { inningsBatted: 1, dismissals: 1, runs: 200 }),
    split("Four", { inningsBatted: 4, dismissals: 4, runs: 600 }),
    split("Five", { inningsBatted: 5, dismissals: 5, runs: 250 }),
    split("Six", { inningsBatted: 6, dismissals: 5, runs: 300 }),
  ];
  const best = bestBattingSplit(rows);
  assert.equal(best?.label, "Six");
  assert.equal(best?.figure, 60);
  assert.equal(MIN_SPLIT_INNINGS, 5);
  assert.equal(bestBattingSplit(rows.slice(0, 2)), null, "no side with five innings: nothing is claimed");
});

test("a side faced only in not-out innings has no average and cannot be the best", () => {
  assert.equal(bestBattingSplit([split("Unbeaten", { inningsBatted: 6, dismissals: 0, runs: 400 })]), null);
});

test("ties go to the side with more innings, then to the name", () => {
  const rows = [split("B", { inningsBatted: 5, dismissals: 5, runs: 250 }), split("A", { inningsBatted: 10, dismissals: 10, runs: 500 }), split("C", { inningsBatted: 10, dismissals: 10, runs: 500 })];
  assert.equal(bestBattingSplit(rows)?.label, "A");
});

test("the bowling split is wickets an innings among sides bowled at in five or more innings", () => {
  const rows = [split("Few", { inningsBowled: 4, wickets: 12 }), split("Many", { inningsBowled: 6, wickets: 9 }), split("Wicketless", { inningsBowled: 8, wickets: 0 })];
  const best = bestBowlingSplit(rows);
  assert.equal(best?.label, "Many");
  assert.equal(best?.wickets, 9);
});

test("the insight line names the number, the side and the innings count, and claims nothing without a qualifying side", () => {
  const rows = [split("Highveld", { inningsBatted: 9, dismissals: 7, runs: 498 })];
  const line = cricketInsightLine(cricketInsights("batting", rows, []));
  assert.equal(line.strong, "Averages 71.14 against Highveld");
  assert.match(line.tail, /in 9 innings/);
  assert.doesNotMatch(line.tail, /best of/, "one side over the floor is not 'the best of' anything");
  const two = cricketInsightLine(cricketInsights("batting", [...rows, split("Other", { inningsBatted: 5, dismissals: 5, runs: 100 })], []));
  assert.match(two.tail, /the best of the 2 sides faced in 5 or more innings on this site/);

  const ground = cricketInsightLine(cricketInsights("batting", [], rows));
  assert.equal(ground.strong, "Averages 71.14 at Highveld");

  const none = cricketInsightLine(cricketInsights("batting", [split("Short", { inningsBatted: 3, dismissals: 3, runs: 300 })], []));
  assert.equal(none.strong, "");
  assert.doesNotMatch(none.tail, /Averages/);
});

test("a bowler leads with wickets, a batter with runs", () => {
  assert.equal(primaryDiscipline({ runs: 5000, wickets: 20 }), "batting");
  assert.equal(primaryDiscipline({ runs: 300, wickets: 120 }), "bowling");
  assert.equal(primaryDiscipline({ runs: 0, wickets: 0 }), "batting");
});

// --- database ---------------------------------------------------------------------------------------------------------

async function team(league: string, id: string, name: string, color: string | null = null) {
  await q(`insert into teams (league, espn_id, name, slug, abbreviation, color) values ($1,$2,$3,$4,$5,$6)`, [league, id, name, name.toLowerCase().replace(/\s+/g, "-"), name.slice(0, 3).toUpperCase(), color]);
}
async function player(league: string, id: string, name: string, slug: string, teamId: string, position: string | null = null) {
  await q(`insert into players (league, espn_id, name, slug, team_espn_id, position) values ($1,$2,$3,$4,$5,$6)`, [league, id, name, slug, teamId, position]);
}
async function game(league: string, id: string, date: string, home: string, away: string, extra: { hs?: number; as?: number; venue?: string | null; season?: number; seasonType?: number } = {}) {
  await q(
    `insert into games (league, espn_id, date, name, home_team_espn_id, away_team_espn_id, season_year, completed, home_score, away_score, venue, season_type) values ($1,$2,$3,$2,$4,$5,$6,true,$7,$8,$9,$10)`,
    [league, id, date, home, away, extra.season ?? 2026, extra.hs ?? null, extra.as ?? null, extra.venue ?? null, extra.seasonType ?? null]
  );
}
async function stat(league: string, gameId: string, playerId: string, teamId: string, stats: unknown) {
  await q(`insert into player_game_stats (league, game_espn_id, player_espn_id, team_espn_id, stats) values ($1,$2,$3,$4,$5)`, [league, gameId, playerId, teamId, JSON.stringify(stats)]);
}
const bat = (runs: number, notOut = false) => ({ batting: { runs, ballsFaced: runs + 10, notOut } });

// Ravi Test: 11 ODIs, in order, oldest first: [opponent, ground, runs, notOut].
const RAVI: [string, string, number, boolean][] = [
  ["2", "Ground A", 100, true],
  ["3", "Ground B", 150, false],
  ["2", "Ground A", 50, false],
  ["3", "Ground B", 150, false],
  ["4", "Ground C", 200, false],
  ["2", "Ground A", 60, false],
  ["3", "Ground B", 150, false],
  ["2", "Ground A", 70, false],
  ["3", "Ground B", 0, false],
  ["2", "Ground A", 80, false],
  ["2", "Ground A", 40, false],
];

before(async () => {
  db = await startTestDb();
  ({ loadTryCard, readTrySuggestions } = await import("../src/lib/tryCardLoader"));
  ({ GET } = await import("../src/app/api/try-card/route"));
  queries = await import("../src/lib/queries");

  // ---- cricket
  for (const [id, name] of [["1", "Alpha"], ["2", "Beta"], ["3", "Gamma"], ["4", "Delta"]] as const) await team("odi", id, name, id === "1" ? "1470af" : null);
  await player("odi", "100", "Ravi Test", "ravi-test", "1", "Batter");
  await player("odi", "101", "Sam Bowl", "sam-bowl", "1");
  await player("odi", "102", "Nobody Played", "nobody-played", "1");
  for (const [i, [opp, venue, runs, notOut]] of RAVI.entries()) {
    const id = `o${i}`;
    await game("odi", id, daysAgo(100 - i), "1", opp, { venue });
    await stat("odi", id, "100", "1", bat(runs, notOut));
  }
  // Sam Bowl: bowling figures, a few runs. 6 games against Beta (14 wickets), 5 against Gamma (2 wickets).
  const wk: [string, number, number][] = [["2", 3, 30], ["2", 2, 25], ["3", 0, 40], ["2", 1, 35], ["3", 1, 33], ["2", 4, 20], ["3", 0, 38], ["2", 2, 28], ["3", 0, 44], ["2", 2, 31], ["3", 1, 36]];
  for (const [i, [opp, w, c]] of wk.entries()) {
    const id = `b${i}`;
    await game("odi", id, daysAgo(50 - i), "1", opp, { venue: "Ground A" });
    await stat("odi", id, "101", "1", { bowling: { overs: 10, bpo: 6, conceded: c, wickets: w }, batting: { runs: 5, notOut: false } });
  }

  // ---- a Test, whose innings are a list beside the match totals
  await team("test", "1", "Alpha");
  await team("test", "2", "Beta");
  await player("test", "110", "Tess Match", "tess-match", "1");
  const inns = [[10, false], [20, true], [30, false], [40, false], [50, false], [60, false]] as const;
  for (let m = 0; m < 3; m++) {
    const a = inns[m * 2];
    const b = inns[m * 2 + 1];
    await game("test", `t${m}`, daysAgo(30 - m), "1", "2", { venue: "Test Ground" });
    await stat("test", `t${m}`, "110", "1", { batting: { runs: a[0] + b[0] }, innings: [{ batting: { runs: a[0], notOut: a[1] } }, { batting: { runs: b[0], notOut: b[1] } }] });
  }

  // ---- football (epl): goals [0,1,2,0,1], assists [1,0,0,1,0]
  await team("epl", "1", "Arsenal", "ef0107");
  await team("epl", "2", "Chelsea", "034694");
  await player("epl", "200", "Gary Goal", "gary-goal", "1", "F");
  const goals = [0, 1, 2, 0, 1];
  const assists = [1, 0, 0, 1, 0];
  for (const [i, g] of goals.entries()) {
    await game("epl", `e${i}`, daysAgo(20 - i), i % 2 ? "1" : "2", i % 2 ? "2" : "1", { hs: 2, as: 1 });
    await stat("epl", `e${i}`, "200", "1", { match: { APP: "1", SUBIN: "0", G: String(g), A: String(assists[i]), SHOT: "3", SOG: "1", YC: "0", RC: "0", FC: "1", FA: "1" } });
  }
  await player("epl", "201", "Bench Warmer", "bench-warmer", "1");

  // ---- basketball (nba), regular season: 20, 30, 10 points
  await team("nba", "31", "Boston Celtics");
  await team("nba", "32", "Miami Heat");
  await player("nba", "300", "Pat Point", "pat-point", "31", "G");
  for (const [i, pts] of [20, 30, 10].entries()) {
    await game("nba", `n${i}`, daysAgo(10 - i), "31", "32", { hs: 100, as: 90, seasonType: 2 });
    await stat("nba", `n${i}`, "300", "31", { box: { MIN: "30", PTS: String(pts), REB: "4", AST: "5", STL: "1", BLK: "0", TO: "2", PF: "2", FG: "5-10", "3PT": "1-3", FT: "2-2" } });
  }
});

after(async () => {
  await (await import("../src/lib/db")).pool.end();
  await db.stop();
});

const call = (query: string) => GET(new Request(`http://localhost/api/try-card${query}`));

test("a batter's card: the career figures his page prints, the last eight innings, and the best side faced in five or more innings", async () => {
  const card = await loadTryCard("odi", "ravi-test");
  assert.ok(card);
  // 1050 runs; 11 innings, one not out, so 10 dismissals: 105.00; five scores of 100 or more (100*, 150, 150, 150, 200).
  assert.deepEqual(card.stats, [
    { value: "1050", label: "Runs" },
    { value: "105.00", label: "Average" },
    { value: "5", label: "100s" },
  ]);
  const career = await queries.getPlayerCricketCareer("odi", "100");
  assert.equal(String(career?.runs), card.stats[0].value, "the runs are the page's career runs");
  assert.equal(career?.matches, 11);
  assert.equal(card.statsCaption, "ODIs on this site · 11 matches");
  assert.match(card.note ?? "", /On this site/);

  // last 8 innings, oldest first: the last eight of the list
  assert.deepEqual(
    card.bars.map((b) => b.label),
    RAVI.slice(-8).map(([, , runs, notOut]) => `${runs}${notOut ? "*" : ""}`)
  );
  assert.equal(card.barsCaption, "Runs, last 8 innings");
  assert.equal(card.bars.at(-1)?.href, "/odi/games/o10");
  assert.equal(card.bars.at(-1)?.title, "v Beta");

  // Beta: 6 innings, runs 100+50+60+70+80+40 = 400, 5 dismissals: 80.00. Gamma has 4 innings (avg 112.5) and Delta 1 (200): below the floor.
  assert.equal(card.insight?.strong, "Averages 80.00 against Beta");
  assert.match(card.insight?.tail ?? "", / in 6 innings on this site\./, "Gamma has four innings, so Beta is the only side over the floor and the line does not say 'best of'");
  assert.equal(card.team, "Alpha");
  assert.equal(card.role, "Batter");
  assert.equal(card.teamColor, "1470af");
  assert.equal(card.href, "/odi/players/ravi-test");
  assert.deepEqual(card.block, { id: "player-form:odi:ravi-test", type: "player-form", params: { league: "odi", player: "ravi-test" }, label: "Ravi Test: last five" });
  assert.equal(card.small, false);
});

test("the split rows the insight reads add up to the page's own opponent and venue tables", async () => {
  const { getCricketInningsSplits } = await import("../src/lib/tryCardLoader");
  for (const dimension of ["opponent", "venue"] as const) {
    const mine = await getCricketInningsSplits("odi", "100", dimension);
    const page = await queries.getPlayerCricketSplits("odi", "100", dimension);
    assert.equal(
      mine.reduce((n, r) => n + r.runs, 0),
      page.reduce((n, r) => n + Number(r.runs), 0),
      `${dimension}: same total runs`
    );
    for (const row of page) {
      const m = mine.find((r) => r.label === row.label);
      assert.ok(m, `${row.label} is in both`);
      assert.equal(m.runs, Number(row.runs), `${row.label} runs`);
    }
  }
});

test("a bowler's card leads with wickets and the side he takes most wickets an innings against", async () => {
  const card = await loadTryCard("odi", "sam-bowl");
  assert.ok(card);
  // 3+2+1+4+2+2 = 14 against Beta in 6 innings, 0+1+0+0+1 = 2 against Gamma in 5: wickets 16 in all.
  assert.equal(card.stats[0].label, "Wickets");
  assert.equal(card.stats[0].value, "16");
  assert.equal(card.barsCaption, "Wickets, last 8 innings");
  assert.deepEqual(card.bars.map((b) => b.label).slice(-3), ["0/44", "2/31", "1/36"]);
  assert.equal(card.insight?.strong, "2.33 wickets an innings against Beta");
  assert.match(card.insight?.tail ?? "", /\(14 in 6 innings\), the most of the 2 sides bowled at in 5 or more innings on this site\./);
});

test("a Test counts innings, not matches: three Tests of two innings is six", async () => {
  const card = await loadTryCard("test", "tess-match");
  assert.ok(card);
  // innings 10, 20*, 30, 40, 50, 60: six innings against Beta, five dismissals, 210 runs: 42.00
  assert.equal(card.insight?.strong, "Averages 42.00 against Beta");
  assert.match(card.insight?.tail ?? "", /in 6 innings/);
  assert.equal(card.stats[0].value, "210");
});

test("a cricketer with no scorecard gets the small card, not an empty one", async () => {
  const card = await loadTryCard("odi", "nobody-played");
  assert.ok(card);
  assert.equal(card.small, true);
  assert.equal(card.name, "Nobody Played");
  assert.equal(card.href, "/odi/players/nobody-played");
  assert.deepEqual(card.stats, []);
  assert.deepEqual(card.bars, []);
  assert.ok(card.block, "he can still be followed");
});

test("a footballer's card is the first tiles of his page's career strip and the last games' goals and assists", async () => {
  const card = await loadTryCard("epl", "gary-goal");
  assert.ok(card);
  // 5 appearances, 4 goals, 2 assists
  assert.deepEqual(card.stats.map((s) => s.value), ["5", "4", "2"]);
  assert.deepEqual(card.stats.map((s) => s.label), ["Apps", "Goals", "Assists"]);
  assert.equal(card.barsCaption, "Goals + assists, last 5 games");
  assert.deepEqual(card.bars.map((b) => b.value), [1, 1, 2, 1, 1], "goals plus assists per game, oldest first");
  assert.equal(card.role, "Forward");
  assert.equal(card.teamColor, "ef0107");
  // the card's tiles are the page's: same builder as the career strip
  const { careerStripStats } = await import("../src/components/PlayerStatsShared");
  const { buildStagedProfile } = await import("../src/lib/playerProfile");
  const staged = buildStagedProfile("soccer", await queries.getPlayerLog("epl", "200"));
  const strip = careerStripStats(staged.regular);
  assert.deepEqual(card.stats.map((s) => s.value), [strip[0], strip[2], strip[3]].map((s) => s.value));
});

test("a footballer with no appearances is the small card", async () => {
  const card = await loadTryCard("epl", "bench-warmer");
  assert.ok(card);
  assert.equal(card.small, true);
  assert.deepEqual(card.bars, []);
});

test("a basketball player's card has the page's per-game tiles and a points chart", async () => {
  const card = await loadTryCard("nba", "pat-point");
  assert.ok(card);
  assert.equal(card.stats[0].label, "GP");
  assert.equal(card.stats[0].value, "3");
  // 20, 30, 10 points: 20.0 a game
  const ppg = card.stats.find((s) => /points per game/i.test(s.label));
  assert.equal(ppg?.value, "20.0");
  assert.deepEqual(card.bars.map((b) => b.value), [20, 30, 10]);
  assert.equal(card.barsCaption, "Points, last 3 games");
});

test("an unknown player is null, and the route answers 400 for bad input and an empty card for a missing player", async () => {
  assert.equal(await loadTryCard("odi", "no-such-player"), null);
  assert.equal(await loadTryCard("atp", "someone"), null, "tennis is not a league with player pages");
  assert.equal((await call("?league=atp&player=someone")).status, 400);
  assert.equal((await call("?league=odi&player=Bad Slug")).status, 400);
  const missing = await call("?league=odi&player=no-such-player");
  assert.equal(missing.status, 200);
  assert.deepEqual(await missing.json(), { card: null });
  assert.equal(missing.headers.get("cache-control"), "public, s-maxage=60, stale-while-revalidate=240");
});

test("the route returns the card under a quarter-hour edge cache", async () => {
  const res = await call("?league=odi&player=ravi-test");
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("cache-control"), "public, s-maxage=900, stale-while-revalidate=3600");
  const { card } = await res.json();
  assert.equal(card.name, "Ravi Test");
  assert.equal(card.stats[0].value, "1050");
});

// --- the week's top performers ----------------------------------------------------------------------------------------

test("the default is the highest cricket score of the last seven days, later game then slug on a tie, and widens when the week is quiet", async () => {
  // Nothing in the last 7 days yet: the 30-day window answers, with the best score in it.
  // Ravi's newest innings was 100 days - 10 = 90 days ago; Sam's newest 50 - 10 days ago = 40 days ago; Tess 30 - 2 = 28 days ago.
  let s = await readTrySuggestions();
  assert.equal(s.featured?.slug, "tess-match", "within 30 days only Tess has played: her best innings is 60");

  await team("ipl", "1", "Chennai");
  await team("ipl", "2", "Mumbai");
  await player("ipl", "400", "Big Hitter", "big-hitter", "1");
  await player("ipl", "401", "Also Big", "also-big", "1");
  await player("ipl", "402", "Quick Bowler", "quick-bowler", "2");
  await game("ipl", "i1", daysAgo(2), "1", "2");
  await game("ipl", "i2", daysAgo(1), "1", "2");
  await stat("ipl", "i1", "400", "1", { batting: { runs: 120 } });
  await stat("ipl", "i2", "401", "1", { batting: { runs: 120 } }); // same score, later game: wins
  await stat("ipl", "i2", "402", "2", { bowling: { overs: 4, bpo: 6, conceded: 20, wickets: 5 } });
  s = await readTrySuggestions();
  assert.equal(s.featured?.slug, "also-big", "a tie on 120 goes to the later game");
  assert.equal(s.featured?.league, "ipl");
  assert.ok(s.chips.some((c) => c.slug === "quick-bowler"), "the week's best bowling is a chip");
  assert.equal(new Set(s.chips.map((c) => `${c.league}/${c.slug}`)).size, s.chips.length, "one chip per person");
  assert.deepEqual(await readTrySuggestions(), s, "the same data picks the same people");
});

test("with no games at all there is no default and no chips: the page shows the search box alone", async () => {
  await q(`delete from player_game_stats`);
  await q(`delete from games`);
  const s = await readTrySuggestions();
  assert.equal(s.featured, null);
  assert.deepEqual(s.chips, []);
});
