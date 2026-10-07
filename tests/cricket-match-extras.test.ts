import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { deriveMatchStory } from "../src/lib/cricketBalls";
import { matchPills, teamColours, splitCricketScore, overNote, seriesNote } from "../src/lib/cricketMatchExtras";

const notes = [
  { type: "seriesnote", text: "India led the 5-match series 1-0" },
  { type: "matchnumber", text: "T20I no. 4166" },
  { type: "season", text: "2026/27" },
  { type: "matchdays", text: "6 October 2026 - night match (20-over match)" },
  { type: "toss", text: "India , elected to field first" },
  { type: "livecommentator", text: "S Sudarshanan" },
  { type: "matchnote", text: "Powerplay: Overs 0.1 - 6.0 (Mandatory - 44 runs, 3 wickets)" },
];

test("pills: toss, series state, match number and the night note, in that order, nothing else", () => {
  assert.deepEqual(matchPills(notes), ["Toss: India, elected to field first", "India lead the 5-match series 1-0", "T20I no. 4166", "Night match"]);
  assert.deepEqual(matchPills(undefined), []);
  assert.deepEqual(matchPills([{ type: "toss", text: "West Indies , elected to bat first" }]), ["Toss: West Indies, elected to bat first"]);
  assert.deepEqual(matchPills([{ type: "matchdays", text: "6 October 2026 - day/night match (50-over match)" }]), ["Day/night match"]);
});

test("team colours come from the header competitors, none when missing or identical", () => {
  const summary = { header: { competitions: [{ competitors: [{ homeAway: "home", team: { color: "050ceb" } }, { homeAway: "away", team: { color: "#790D1A" } }] }] } };
  assert.deepEqual(teamColours(summary), { home: "#050ceb", away: "#790d1a" });
  assert.deepEqual(teamColours({ header: { competitions: [{ competitors: [{ homeAway: "home", team: { color: "#111111" } }, { homeAway: "away", team: { color: "#111111" } }] }] } }), { home: null, away: null });
  assert.deepEqual(teamColours({ header: { competitions: [{ competitors: [{ homeAway: "home", team: {} }, { homeAway: "away", team: { color: "#111111" } }] }] } }), { home: null, away: null });
  assert.deepEqual(teamColours(null), { home: null, away: null });
});

test("a score splits into the figure and the overs detail", () => {
  assert.deepEqual(splitCricketScore("172/2 (14.4/20 ov, target 172)"), { main: "172/2", detail: "14.4/20 ov, target 172" });
  assert.deepEqual(splitCricketScore("171"), { main: "171", detail: null });
  assert.deepEqual(splitCricketScore("236 & 171/4d"), { main: "236 & 171/4d", detail: null });
  assert.deepEqual(splitCricketScore(""), { main: "", detail: null });
});

test("the over note is a wicket line for each wicket in the over, then the score after it", () => {
  const items = JSON.parse(readFileSync(new URL("./fixtures/espn-cricket-playbyplay-1529230.json", import.meta.url), "utf8")) as unknown[];
  const [wi, ind] = deriveMatchStory(items);
  assert.equal(overNote(wi.overs[5], wi), "Shimron Hetmyer run out; Rovman Powell b Axar Patel 0. West Indies 44/3 after 6 overs.");
  assert.equal(overNote(wi.overs[4], wi), "Kamil Pooran b Arshdeep Singh 12. West Indies 44/1 after 5 overs.");
  assert.equal(overNote(wi.overs[11], wi), "Shai Hope c Axar Patel b Naman Dhir 52. West Indies 109/4 after 12 overs.");
  assert.equal(overNote(wi.overs[12], wi), "Roston Chase lbw b Kuldeep Yadav 5. West Indies 115/5 after 13 overs.");
  assert.equal(overNote(ind.overs[3], ind), "Sanju Samson c & b Akeal Hosein 11. India 36/2 after 4 overs.");
  assert.equal(overNote(ind.overs[13], ind), "India 164/2 after 14 overs.");
  assert.equal(overNote(wi.overs[19], wi), "Akeal Hosein c Ishan Kishan b Axar Patel 15. West Indies 171 all out.");
  assert.equal(overNote(ind.overs[14], ind), "India 172/2, target reached.");
});

test("the Player of the Match line picks the figures that earned it: a big score, a bowling return, or both", async () => {
  const { potmLine } = await import("../src/lib/cricketMatchExtras");
  const card = (batting: [string, string, string[]][], bowling: [string, string[]][]) => [
    { battingRows: batting.map(([name, dismissal, stats]) => ({ name, dismissal, stats })), bowlingRows: bowling.map(([name, stats]) => ({ name, stats })) },
  ];
  // Iyer: 102 not out off 43, did not bowl
  assert.equal(potmLine(card([["Shreyas Iyer", "not out", ["102", "43", "10", "6", "237.2"]]], []), "Shreyas Iyer"), "102* (43)");
  // Naeem Ahmed: 30 off 95 and 5 for 119: the wickets earned it
  assert.equal(potmLine(card([["Naeem Ahmed", "c Ali b Khan", ["30", "95", "2", "0", "31.5"]]], [["Naeem Ahmed", ["41", "8", "119", "5", "2.90"]]]), "Naeem Ahmed"), "5/119");
  // an all-rounder's day: both
  assert.equal(potmLine(card([["Axar Patel", "not out", ["64", "40", "5", "3", "160.0"]]], [["Axar Patel", ["4", "0", "26", "3", "6.50"]]]), "Axar Patel"), "64* (40) & 3/26");
  // two innings: the better of each
  assert.equal(potmLine([...card([["Mahfijul Islam", "lbw b Debbarma", ["70", "135", "6", "3", "51.9"]]], []), ...card([["Mahfijul Islam", "c Ali b Ahmed", ["100", "160", "9", "1", "62.5"]]], [])], "Mahfijul Islam"), "100 (160)");
  // not in the card at all
  assert.equal(potmLine(card([], []), "Nobody"), null);
});

test("the live line keeps ESPN's status sentence and adds the rates from the last ball", async () => {
  const { liveStatusLine } = await import("../src/lib/cricketMatchExtras");
  const last = { runRate: 11.72, requiredRunRate: 8.4 } as never;
  assert.equal(liveStatusLine("India need 52 runs from 30 balls", last), "India need 52 runs from 30 balls · run rate 11.72 · required 8.40");
  assert.equal(liveStatusLine("India need 52 runs from 30 balls", undefined), "India need 52 runs from 30 balls");
  assert.equal(liveStatusLine(null, { runRate: 8.92, requiredRunRate: null } as never), "Run rate 8.92");
  assert.equal(liveStatusLine(null, undefined), null);
});

test("a stumping names the keeper; a wicket with no bowler in the feed falls back to ESPN's line, then to the type", async () => {
  const { overNote } = await import("../src/lib/cricketMatchExtras");
  type Wicket = import("../src/lib/cricketBalls").StoryWicket;
  const base: Wicket = { over: 1, runs: 10, wicket: 1, batter: "A Batter", how: "stumped", bowler: "B Spinner", fielder: "K Keeper", keeper: true, batterRuns: 4, text: "A Batter st K Keeper b B Spinner 4 (10m 8b)" };
  const innings = (w: Wicket) => ({ period: 1, teamId: "1", team: "Side", overs: [{ number: 2, runs: 4, wickets: 1, balls: [] }], worm: [{ over: 2, runs: 10, wickets: 1 }], wickets: [w], partnerships: [], total: { runs: 10, wickets: 1, overs: 2 }, runRate: 5, requiredRunRate: null, target: null, limit: 20 });
  assert.equal(overNote(innings(base).overs[0], innings(base)), "A Batter st \u2020K Keeper b B Spinner 4. Side 10/1 after 2 overs.");
  const noBowler = { ...base, how: "bowled", bowler: null, fielder: null, keeper: false, text: "A Batter b Someone 4 (10m 8b)" };
  assert.equal(overNote(innings(noBowler).overs[0], innings(noBowler)), "A Batter b Someone 4. Side 10/1 after 2 overs.");
  const bare = { ...noBowler, text: "" };
  assert.equal(overNote(innings(bare).overs[0], innings(bare)), "A Batter bowled 4. Side 10/1 after 2 overs.");
});

test("the series note reads in the present tense and is null without one", () => {
  assert.equal(seriesNote([{ type: "seriesnote", text: "India led the 3-match series 1-0" }]), "India lead the 3-match series 1-0");
  assert.equal(seriesNote([{ type: "toss", text: "x" }]), null);
});
