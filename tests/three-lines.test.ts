import { test } from "node:test";
import assert from "node:assert/strict";
import { FRESH_HOURS, factWeight, selectLines, sportOf, type LineFact } from "../src/lib/threeLines";
import { cricketFacts, gameScope, teamStreakFacts, type CricketInningsRow } from "../src/lib/threeLinesFacts";

const now = new Date("2026-10-08T12:00:00Z");
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000).toISOString();

let n = 0;
function fact(over: Partial<LineFact> = {}): LineFact {
  n++;
  return { id: `f${n}`, sport: "soccer", kind: "win-streak", text: `Team ${n} have won 4 games in a row.`, figure: "4 games in a row", href: `/epl/teams/t${n}`, at: hoursAgo(5), weight: 50, ...over };
}

test("no facts: no lines", () => {
  assert.deepEqual(selectLines([], now), []);
});

test("a fact older than the window is excluded, one at the edge is kept", () => {
  const stale = fact({ at: hoursAgo(FRESH_HOURS + 1), weight: 99 });
  const edge = fact({ at: hoursAgo(FRESH_HOURS) });
  assert.deepEqual(selectLines([stale, edge], now), [edge]);
  assert.deepEqual(selectLines([stale], now), []);
});

test("a fact dated in the future (beyond clock skew), or with a broken date, is excluded", () => {
  const future = fact({ at: new Date(now.getTime() + 3_600_000).toISOString() });
  const skew = fact({ at: new Date(now.getTime() + 60_000).toISOString() });
  const broken = fact({ at: "not a date" });
  assert.deepEqual(selectLines([future, broken, skew], now), [skew]);
});

test("a fact whose figure is not in its text, or with no link, is excluded rather than shown wrong", () => {
  assert.deepEqual(selectLines([fact({ figure: "7 games in a row" }), fact({ href: "" }), fact({ text: "" })], now), []);
});

test("fewer than three facts give fewer than three lines: nothing is padded", () => {
  const a = fact();
  const b = fact({ sport: "cricket" });
  assert.equal(selectLines([a, b], now).length, 2);
  assert.equal(selectLines([a], now).length, 1);
});

test("sport variety: one line per sport before a sport gets a second", () => {
  const soccer = [fact({ weight: 90 }), fact({ weight: 80 }), fact({ weight: 70 })];
  const cricket = fact({ sport: "cricket", weight: 40 });
  const nfl = fact({ sport: "nfl", weight: 30 });
  const picked = selectLines([...soccer, cricket, nfl], now);
  assert.deepEqual(picked.map((f) => f.sport).sort(), ["cricket", "nfl", "soccer"]);
  assert.equal(picked.find((f) => f.sport === "soccer"), soccer[0]);
});

test("when sports run out a sport may add a second line, never a third", () => {
  const soccer = [fact({ weight: 90 }), fact({ weight: 80 }), fact({ weight: 70 })];
  const picked = selectLines(soccer, now);
  assert.deepEqual(picked, [soccer[0], soccer[1]]);
  const withCricket = selectLines([...soccer, fact({ sport: "cricket", weight: 10 })], now);
  assert.deepEqual(withCricket.map((f) => f.sport), ["soccer", "soccer", "cricket"]);
});

test("strongest first; equal weights go to the more recent fact, then to the smaller id", () => {
  const strong = fact({ sport: "nba", weight: 70, at: hoursAgo(40) });
  const newer = fact({ sport: "nfl", weight: 60, at: hoursAgo(2) });
  const older = fact({ sport: "mlb", weight: 60, at: hoursAgo(20) });
  assert.deepEqual(selectLines([older, newer, strong], now), [strong, newer, older]);
  const a = fact({ id: "a", sport: "x", at: hoursAgo(3) });
  const b = fact({ id: "b", sport: "y", at: hoursAgo(3) });
  assert.deepEqual(selectLines([b, a], now), [a, b]);
  assert.deepEqual(selectLines([a, b], now), [a, b]);
});

test("a tie never changes which sports are kept when only two lines fit", () => {
  const a = fact({ id: "a", sport: "soccer", at: hoursAgo(3) });
  const b = fact({ id: "b", sport: "cricket", at: hoursAgo(3) });
  const c = fact({ id: "c", sport: "nfl", at: hoursAgo(3) });
  assert.deepEqual(selectLines([c, b, a], now, { max: 2 }).map((f) => f.id), ["a", "b"]);
});

test("two lines never point at the same page, and a repeated id is shown once", () => {
  const first = fact({ sport: "cricket", weight: 80, href: "/odi/games/1" });
  const second = fact({ sport: "cricket", weight: 70, href: "/odi/games/1" });
  const other = fact({ sport: "nfl", weight: 10 });
  assert.deepEqual(selectLines([first, second, other], now), [first, other]);
  const dup = fact({ id: "same", weight: 20 });
  assert.equal(selectLines([dup, { ...dup, weight: 60 }], now).length, 1);
  assert.equal(selectLines([dup, { ...dup, weight: 60 }], now)[0].weight, 60);
});

test("a weight that is not a number does not break the order", () => {
  const ok = fact({ sport: "nba", weight: 5 });
  const bad = fact({ sport: "nfl", weight: Number.NaN });
  assert.deepEqual(selectLines([bad, ok], now), [ok, bad]);
});

test("weights: longer runs and bigger innings rank higher, with caps", () => {
  assert.ok(factWeight("win-streak", 6) > factWeight("win-streak", 3));
  assert.equal(factWeight("win-streak", 40), factWeight("win-streak", 20));
  assert.ok(factWeight("hundred", 150) > factWeight("hundred", 100));
  assert.ok(factWeight("five-for", 7) > factWeight("five-for", 5));
  assert.ok(factWeight("season-perfect", 5) > factWeight("win-streak", 5));
});

test("sport families: football leagues are one sport, cricket competitions another", () => {
  assert.equal(sportOf("epl"), "soccer");
  assert.equal(sportOf("mls"), "soccer");
  assert.equal(sportOf("odi"), "cricket");
  assert.equal(sportOf("ipl"), "cricket");
  assert.equal(sportOf("nfl"), "nfl");
});

// ---- facts from stored figures ----

const last = new Date("2026-10-07T20:00:00Z");

test("team claims become sentences linking to the team page, with the figure inside the text", () => {
  const base = { league: "epl" as const, teamEspnId: "7", teamName: "Arsenal", teamSlug: "arsenal", lastPlayed: last, scope: "season" as const };
  const facts = teamStreakFacts({ ...base, claims: ["5 straight wins", "Unbeaten in 7"] });
  assert.equal(facts.length, 2);
  for (const f of facts) {
    assert.ok(f.text.includes(f.figure));
    assert.equal(f.href, "/epl/teams/arsenal");
    assert.equal(f.sport, "soccer");
    assert.equal(f.at, last.toISOString());
  }
  assert.equal(facts[0].text, "Arsenal have won 5 games in a row in the Premier League.");
  assert.equal(facts[1].text, "Arsenal are unbeaten in 7 games in the Premier League.");
  assert.notEqual(facts[0].id, facts[1].id);
});

test("whole-season claims are worded as the season's", () => {
  const f = teamStreakFacts({ league: "nfl", teamEspnId: "1", teamName: "Bay City", teamSlug: "bay-city", lastPlayed: last, scope: "season", claims: ["Won all 5 games this season"] });
  assert.equal(f[0].text, "Bay City have won all 5 of their games in the NFL this season.");
  const u = teamStreakFacts({ league: "laliga", teamEspnId: "1", teamName: "Real", teamSlug: "real", lastPlayed: last, scope: "season", claims: ["Unbeaten in 6 games this season"] });
  assert.equal(u[0].text, "Real are unbeaten in all 6 of their games in La Liga this season.");
});

test("a whole-season claim says what the stored games cover: the season, the playoffs, or nothing if that is not known", () => {
  const args = { league: "mlb" as const, teamEspnId: "1", teamName: "Tampa Bay Rays", teamSlug: "tampa-bay-rays", lastPlayed: last, claims: ["Won all 3 games this season"] };
  assert.equal(teamStreakFacts({ ...args, scope: "playoffs" })[0].text, "Tampa Bay Rays have won all 3 of their playoff games in the MLB.");
  assert.deepEqual(teamStreakFacts({ ...args, scope: "unknown" }), []);
  const unbeaten = { ...args, league: "mls" as const, claims: ["Unbeaten in 6 games this season"] };
  assert.equal(teamStreakFacts({ ...unbeaten, scope: "playoffs" })[0].text, "Tampa Bay Rays are unbeaten in all 6 of their playoff games in MLS.");
  assert.deepEqual(teamStreakFacts({ ...unbeaten, scope: "unknown" }), []);
  // A run is true whatever the list covers.
  assert.equal(teamStreakFacts({ ...args, claims: ["4 straight wins"], scope: "unknown" }).length, 1);
});

test("game scope: regular-season games make it the season, only postseason games make it the playoffs, excluded games do not count", () => {
  assert.equal(gameScope([{ stage: "playoffs" }, { stage: "regular" }]), "season");
  assert.equal(gameScope([{ stage: "playoffs" }, { stage: "playin" }, { stage: "excluded" }]), "playoffs");
  assert.equal(gameScope([{ stage: "excluded" }]), "unknown");
  assert.equal(gameScope([{ stage: null }]), "unknown");
  assert.equal(gameScope([]), "unknown");
});

test("an unrecognised claim or an unknown last-played date yields no fact", () => {
  const base = { league: "nba" as const, teamEspnId: "1", teamName: "X", teamSlug: "x" };
  assert.deepEqual(teamStreakFacts({ ...base, lastPlayed: last, scope: "season", claims: ["Best team in the world"] }), []);
  assert.deepEqual(teamStreakFacts({ ...base, lastPlayed: null, scope: "season", claims: ["3 straight wins"] }), []);
  assert.deepEqual(teamStreakFacts({ ...base, lastPlayed: last, scope: "season", claims: [] }), []);
});

const inn = (over: Partial<CricketInningsRow> = {}): CricketInningsRow => ({
  league: "odi", matchId: "m1", inningsNo: 1, playerId: "p1", playerName: "A. Rahman", teamName: "Coral Coast", opponentName: "Highveld", runs: null, ballsFaced: null, notOut: false, wickets: null, conceded: null, at: last, ...over,
});

test("a hundred and a five-for are lines, 99 and 4 are not", () => {
  const facts = cricketFacts([inn({ runs: 112, ballsFaced: 61, notOut: true }), inn({ playerId: "p2", runs: 99 }), inn({ playerId: "p3", wickets: 5, conceded: 23 }), inn({ playerId: "p4", wickets: 4, conceded: 10 })]);
  assert.equal(facts.length, 2);
  assert.equal(facts[0].text, "A. Rahman made 112* off 61 balls for Coral Coast against Highveld.");
  assert.equal(facts[0].figure, "112*");
  assert.equal(facts[0].href, "/odi/games/m1");
  assert.equal(facts[1].figure, "5/23");
  assert.equal(facts[1].text, "A. Rahman took 5/23 for Coral Coast against Highveld.");
  assert.ok(facts.every((f) => f.sport === "cricket"));
});

test("a series match links to its match page; missing balls are left out of the sentence; an all-rounder gets two facts", () => {
  const facts = cricketFacts([inn({ league: "cricket", matchId: "999", runs: 104, wickets: 5, conceded: 30 })]);
  assert.deepEqual(facts.map((f) => f.kind).sort(), ["five-for", "hundred"]);
  assert.ok(facts.every((f) => f.href === "/cricket/matches/999"));
  assert.equal(facts.find((f) => f.kind === "hundred")?.text, "A. Rahman made 104 for Coral Coast against Highveld.");
});

test("a stale streak is dropped and a fresh one kept: the pipeline end to end", () => {
  const fresh = teamStreakFacts({ league: "nba", teamEspnId: "1", teamName: "Bulls", teamSlug: "bulls", lastPlayed: last, scope: "season", claims: ["4 straight wins"] });
  const old = teamStreakFacts({ league: "nfl", teamEspnId: "2", teamName: "Jets", teamSlug: "jets", lastPlayed: new Date("2026-10-01T00:00:00Z"), scope: "season", claims: ["9 straight wins"] });
  const lines = selectLines([...old, ...fresh], now);
  assert.deepEqual(lines.map((l) => l.href), ["/nba/teams/bulls"]);
});
