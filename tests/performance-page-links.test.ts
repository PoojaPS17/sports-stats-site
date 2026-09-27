import { test } from "node:test";
import assert from "node:assert/strict";
import { performancePagePath } from "../src/lib/performanceCardData";

test("performancePagePath builds the new page's URL from a league, game id and player slug", () => {
  assert.equal(performancePagePath("nba", "g1", "luka-doncic"), "/nba/games/g1/players/luka-doncic");
  assert.equal(performancePagePath("nfl", "401872953", "josh-allen"), "/nfl/games/401872953/players/josh-allen");
});

test("performancePagePath is what Best games / Milestones rows should link to for a given historical game", () => {
  // Best games and Milestones both key off game_espn_id already present on every PlayerLogRow —
  // this just confirms the same helper produces a stable, correct path for that value.
  assert.equal(performancePagePath("nba", "0022400123", "luka-doncic"), "/nba/games/0022400123/players/luka-doncic");
});
