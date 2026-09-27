import { test } from "node:test";
import assert from "node:assert/strict";
import { performancePagePath } from "../src/lib/performanceCardData";

test("performancePagePath builds the new page's URL from a league, game id and player slug", () => {
  assert.equal(performancePagePath("nba", "g1", "luka-doncic"), "/nba/games/g1/players/luka-doncic");
  assert.equal(performancePagePath("nfl", "401872953", "josh-allen"), "/nfl/games/401872953/players/josh-allen");
});
