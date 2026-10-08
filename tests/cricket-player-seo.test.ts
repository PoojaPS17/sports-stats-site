import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { cricketPlayerDescription } from "../src/lib/cricketPlayerSeo";
import type { CricketCareerStats } from "../src/lib/queries";

const career = (over: Partial<CricketCareerStats> = {}): CricketCareerStats => ({
  matches: 252,
  inningsBatted: 244,
  runs: 8004,
  ballsFaced: 6100,
  inningsWithBalls: 244,
  notOuts: 30,
  hundreds: 8,
  fifties: 55,
  highestScore: 113,
  highestScoreNotOut: false,
  average: 38.67,
  strikeRate: 131.2,
  inningsBowled: 26,
  overs: 41.5,
  runsConceded: 368,
  wickets: 4,
  economy: 8.8,
  fiveWicketHauls: 0,
  catches: 110,
  ...over,
});

test("a batter's description carries the figures a searcher wants", () => {
  assert.equal(
    cricketPlayerDescription("ipl", "Virat Kohli", "Royal Challengers Bengaluru", career()),
    "Virat Kohli IPL stats: 252 matches, 8,004 runs at 38.67 with 8 hundreds and 55 fifties, best 113, for Royal Challengers Bengaluru. Match log and splits."
  );
});

test("a bowler's description leads with wickets, and a bowler who barely bats has no batting line", () => {
  const bowler = career({ matches: 180, inningsBatted: 40, runs: 210, hundreds: 0, fifties: 0, highestScore: 21, average: 9.1, inningsBowled: 178, wickets: 230, runsConceded: 5120, economy: 7.3, fiveWicketHauls: 2 });
  assert.equal(
    cricketPlayerDescription("ipl", "Jasprit Bumrah", "Mumbai Indians", bowler),
    "Jasprit Bumrah IPL stats: 180 matches, 230 wickets at 22.26 with 2 five-wicket hauls, 210 runs, for Mumbai Indians. Match log and splits."
  );
});

test("an all-rounder gets both lines, runs first when they outweigh the wickets", () => {
  const ar = career({ matches: 100, runs: 2500, hundreds: 1, fifties: 12, highestScore: 104, average: 31.25, wickets: 90, runsConceded: 2700, fiveWicketHauls: 0 });
  assert.equal(cricketPlayerDescription("ipl", "A Player", null, ar), "A Player IPL stats: 100 matches, 2,500 runs at 31.25 with 1 hundred and 12 fifties, best 104, 90 wickets at 30.00. Match log and splits.");
});

test("the tail is dropped rather than letting the description run past 160 characters", () => {
  const long = cricketPlayerDescription("wbbl", "Alyssa Jane Healy-Starc Longname", "Sydney Sixers Women Cricket Club", career());
  assert.ok(long.length <= 160, `${long.length}: ${long}`);
  assert.doesNotMatch(long, /Match log/);
  assert.match(long, /8,004 runs/);
});

test("a player with no stored innings keeps the plain description", () => {
  assert.equal(cricketPlayerDescription("ipl", "New Player", "Gujarat Titans", null), "New Player (Gujarat Titans) IPL career figures, match-by-match record and splits.");
  assert.equal(cricketPlayerDescription("ipl", "New Player", null, null), "New Player IPL career figures, match-by-match record and splits.");
});

test("the player page uses it for cricket leagues, reading the career once", () => {
  const page = readFileSync(fileURLToPath(new URL("../src/app/[league]/players/[slug]/page.tsx", import.meta.url)), "utf8");
  assert.match(page, /cricketPlayerDescription\(league, player\.name, player\.team_name/);
  assert.match(page, /const cachedCareer = cache\(/, "the career is read once for the title and the page");
  assert.doesNotMatch(page, /career figures, match-by-match record and splits/, "the fixed wording moved into the helper");
});
