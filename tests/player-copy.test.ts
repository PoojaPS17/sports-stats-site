// The NBA copy for games ESPN published no box score for: exact strings, singular and plural.
import { test } from "node:test";
import assert from "node:assert/strict";
import { NBA_NO_BOX_SCORE_NOTE, noBoxScoreGamesTitle, unlistedGamesNote } from "../src/lib/playerCopy";

test("the section note names what the games count toward and what they leave out", () => {
  assert.equal(
    NBA_NO_BOX_SCORE_NOTE,
    "ESPN published no box score for some of this player's games. Those games count toward GP (ESPN's own figure where it is stored) but not toward the per-game averages, the game log or the best games, and W-L is left blank for those seasons."
  );
});

test("noBoxScoreGamesTitle: ESPN's own figure", () => {
  assert.equal(noBoxScoreGamesTitle(1, "espn"), "Includes 1 game ESPN published no box score for.");
  assert.equal(noBoxScoreGamesTitle(2, "espn"), "Includes 2 games ESPN published no box score for.");
});

test("noBoxScoreGamesTitle: a count from the game rosters says ESPN's figure is not stored", () => {
  const tail = "ESPN's own games-played figure is not stored for this season.";
  assert.equal(noBoxScoreGamesTitle(1, "listed"), `Includes 1 game ESPN published no box score for, counted from the game rosters; ${tail}`);
  assert.equal(noBoxScoreGamesTitle(2, "listed"), `Includes 2 games ESPN published no box score for, counted from the game rosters; ${tail}`);
  // Only "espn" is ESPN's figure; the logged source is worded like the listed one.
  assert.equal(noBoxScoreGamesTitle(2, "logged"), noBoxScoreGamesTitle(2, "listed"));
});

test("unlistedGamesNote agrees with the count", () => {
  assert.equal(unlistedGamesNote(1), "1 game ESPN published no box score for is not listed.");
  assert.equal(unlistedGamesNote(2), "2 games ESPN published no box score for are not listed.");
});
