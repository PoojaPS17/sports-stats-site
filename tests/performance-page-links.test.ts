import { test } from "node:test";
import assert from "node:assert/strict";
import { performancePagePath, stageProfileFor } from "../src/lib/performanceCardData";
import type { StagedProfile } from "../src/lib/playerProfile";

test("performancePagePath builds the new page's URL from a league, game id and player slug", () => {
  assert.equal(performancePagePath("nba", "g1", "luka-doncic"), "/nba/games/g1/players/luka-doncic");
  assert.equal(performancePagePath("nfl", "401872953", "josh-allen"), "/nfl/games/401872953/players/josh-allen");
});

test("performancePagePath is what Best games / Milestones rows should link to for a given historical game", () => {
  // Best games and Milestones both key off game_espn_id already present on every PlayerLogRow —
  // this just confirms the same helper produces a stable, correct path for that value.
  assert.equal(performancePagePath("nba", "0022400123", "luka-doncic"), "/nba/games/0022400123/players/luka-doncic");
});

test("stageProfileFor picks the profile matching the row's own stage", () => {
  const regular = { rows: [{ tag: "regular-profile" }] } as unknown as StagedProfile["regular"];
  const playoffs = { rows: [{ tag: "playoffs-profile" }] } as unknown as StagedProfile["playoffs"];
  const playin = { rows: [{ tag: "playin-profile" }] } as unknown as StagedProfile["playin"];
  const staged = { split: true, regular, playoffs, playin, counted: regular, log: [] } as StagedProfile;
  assert.equal(stageProfileFor(staged, "regular"), regular);
  assert.equal(stageProfileFor(staged, "other"), regular);
  assert.equal(stageProfileFor(staged, "playoffs"), playoffs);
  assert.equal(stageProfileFor(staged, "playin"), playin);
  assert.equal(stageProfileFor(staged, "excluded"), null);
});
