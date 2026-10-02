// A per-game performance card for an MLB player: a batter's reads AB, R, H, HR, RBI, BB, K and AVG;
// a pitcher's reads IP, H, R, ER, BB, K and ERA. The "vs season avg" chip follows the existing rule —
// nothing with fewer than two games on record, because the only game's average is the game itself.
import { before, test } from "node:test";
import assert from "node:assert/strict";
import type { PlayerLogRow, PlayerProfile, Stats } from "../src/lib/playerProfile";

process.env.DATABASE_URL ??= "postgres://postgres:password@localhost:1/none";
let performanceLine: typeof import("../src/lib/performanceLine").performanceLine;
let buildStagedProfile: typeof import("../src/lib/playerProfile").buildStagedProfile;
let supportsPerformanceCards: typeof import("../src/lib/performanceCardData").supportsPerformanceCards;
let performancePagePath: typeof import("../src/lib/performanceCardData").performancePagePath;
let PERFORMANCE_CARD_LEAGUES: typeof import("../src/lib/performanceCardData").PERFORMANCE_CARD_LEAGUES;
before(async () => {
  ({ performanceLine } = await import("../src/lib/performanceLine"));
  ({ buildStagedProfile } = await import("../src/lib/playerProfile"));
  ({ supportsPerformanceCards, performancePagePath, PERFORMANCE_CARD_LEAGUES } = await import("../src/lib/performanceCardData"));
});

let id = 0;
function row(stats: Stats, date = "2026-06-01T23:10:00Z"): PlayerLogRow {
  id += 1;
  return {
    game_espn_id: `g${id}`,
    date,
    season_year: 2026,
    round: null,
    week: null,
    stage: "regular",
    season_type: 2,
    competition_type: "STD",
    is_home: true,
    team_espn_id: "10",
    team_name: "New York Yankees",
    team_slug: "new-york-yankees",
    team_abbr: "NYY",
    team_logo: null,
    opponent_espn_id: "2",
    opponent_name: "Boston Red Sox",
    opponent_slug: "boston-red-sox",
    opponent_abbr: "BOS",
    opponent_logo: null,
    team_score: 5,
    opponent_score: 3,
    result: "W",
    stats,
  } as unknown as PlayerLogRow;
}

const batting = (line: Record<string, string>): Stats => ({ batting: { GS: "1", ...line } });
const pitching = (line: Record<string, string>): Stats => ({ pitching: line });

function profileOf(rows: PlayerLogRow[]): PlayerProfile {
  return buildStagedProfile("mlb", rows).regular;
}

test("MLB has performance cards, from the one list the share buttons and the route read", () => {
  assert.equal(supportsPerformanceCards("mlb"), true);
  assert.ok((PERFORMANCE_CARD_LEAGUES as readonly string[]).includes("mlb"));
  assert.equal(performancePagePath("mlb", "401907973", "aaron-judge"), "/mlb/games/401907973/players/aaron-judge");
  // A league with no cards is still refused.
  assert.equal(supportsPerformanceCards("epl"), false);
});

test("a batter's card is AB, R, H, HR, RBI, BB, K and AVG, in that order", () => {
  const rows = [
    row(batting({ AB: "4", R: "2", H: "3", HR: "2", RBI: "5", BB: "1", K: "0" })),
    row(batting({ AB: "4", R: "0", H: "1", HR: "0", RBI: "0", BB: "0", K: "2" }), "2026-06-02T23:10:00Z"),
  ];
  const stats = performanceLine("mlb", rows[0], profileOf(rows));
  assert.deepEqual(stats.map((s) => s.label), ["AB", "R", "H", "HR", "RBI", "BB", "K", "AVG"]);
  assert.deepEqual(stats.map((s) => s.value), ["4", "2", "3", "2", "5", "1", "0", ".750"]);
});

test("a pitcher's card is IP, H, R, ER, BB, K and ERA, in that order", () => {
  const rows = [
    row(pitching({ IP: "7.0", H: "4", R: "1", ER: "1", BB: "1", K: "9", HR: "0" })),
    row(pitching({ IP: "5.1", H: "7", R: "4", ER: "4", BB: "3", K: "4", HR: "2" }), "2026-06-07T23:10:00Z"),
  ];
  const stats = performanceLine("mlb", rows[0], profileOf(rows));
  assert.deepEqual(stats.map((s) => s.label), ["IP", "H", "R", "ER", "BB", "K", "ERA"]);
  assert.deepEqual(stats.map((s) => s.value), ["7.0", "4", "1", "1", "1", "9", "1.29"]);
});

test("the delta is against the season's per-game figure, and is null in a one-game season", () => {
  const one = [row(batting({ AB: "4", R: "1", H: "2", HR: "1", RBI: "3", BB: "0", K: "1" }))];
  for (const s of performanceLine("mlb", one[0], profileOf(one))) {
    assert.equal(s.delta, null, `${s.label} has no delta in a season of one game`);
  }

  // Two games: 3 home runs over two games is 1.5 a game, so a two-homer game is "+1 vs season avg".
  const two = [
    row(batting({ AB: "4", R: "2", H: "3", HR: "2", RBI: "4", BB: "0", K: "0" })),
    row(batting({ AB: "4", R: "0", H: "1", HR: "1", RBI: "1", BB: "0", K: "1" }), "2026-06-02T23:10:00Z"),
  ];
  const stats = performanceLine("mlb", two[0], profileOf(two));
  assert.equal(stats.find((s) => s.label === "HR")?.delta, "+1 vs season avg");
  // One strikeout over two games is 0.5 a game, and a strikeout-free game is half of one below it,
  // which rounds to a whole figure the way every other counting stat's delta does.
  assert.equal(stats.find((s) => s.label === "K")?.delta, "-1 vs season avg");
  // A shortfall that rounds away to nothing reads "+0", never "-0" — the existing rule.
  assert.equal(stats.find((s) => s.label === "BB")?.delta, "+0 vs season avg");
});

test("a two-way player's card is his batting line, which is what a card is for", () => {
  const rows = [
    row({ ...batting({ AB: "4", R: "1", H: "2", HR: "1", RBI: "2", BB: "1", K: "1" }), ...pitching({ IP: "6.0", H: "3", R: "1", ER: "1", BB: "1", K: "10", HR: "0" }) }),
    row({ ...batting({ AB: "3", R: "0", H: "1", HR: "0", RBI: "0", BB: "0", K: "1" }), ...pitching({ IP: "7.0", H: "2", R: "0", ER: "0", BB: "0", K: "8", HR: "0" }) }, "2026-06-08T23:10:00Z"),
  ];
  const stats = performanceLine("mlb", rows[0], profileOf(rows));
  assert.deepEqual(stats.map((s) => s.label), ["AB", "R", "H", "HR", "RBI", "BB", "K", "AVG", "IP", "ER", "ERA"]);
});

test("a card for a player who did not bat shows dashes, not zeros", () => {
  const rows = [row(pitching({ IP: "1.0", H: "0", R: "0", ER: "0", BB: "0", K: "2", HR: "0" })), row(pitching({ IP: "1.0", H: "1", R: "0", ER: "0", BB: "0", K: "1", HR: "0" }), "2026-06-03T23:10:00Z")];
  const stats = performanceLine("mlb", rows[0], profileOf(rows));
  assert.equal(stats.find((s) => s.label === "IP")?.value, "1.0");
  assert.ok(!stats.some((s) => s.label === "AB"), "no batting columns at all for a pitcher");
});
