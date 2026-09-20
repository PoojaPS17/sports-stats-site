// The NBA copy for games ESPN published no box score for: exact strings, singular and plural.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  gamesAndFigures,
  NBA_NO_BOX_SCORE_CARD_NOTE,
  NBA_NO_BOX_SCORE_NOTE,
  NBA_NO_BOX_SCORE_STAGE_NOTE,
  noBoxScoreGamesTitle,
  unlistedGamesNote,
  withNoBoxScoreNote,
} from "../src/lib/playerCopy";

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

test("the playoffs and play-in note counts the games from the rosters and does not mention ESPN's own figure", () => {
  assert.equal(
    NBA_NO_BOX_SCORE_STAGE_NOTE,
    "ESPN published no box score for some of this player's games. Those games are counted from the game rosters toward GP but not toward the per-game averages, the game log or the best games, and W-L is left blank for those seasons."
  );
  assert.equal(NBA_NO_BOX_SCORE_STAGE_NOTE.includes("ESPN's own figure"), false);
});

test("withNoBoxScoreNote appends the note for the stage, and only when some games have no box score", () => {
  assert.equal(withNoBoxScoreNote("Text.", 0, "regular"), "Text.");
  assert.equal(withNoBoxScoreNote("Text.", 0, "other"), "Text.");
  assert.equal(withNoBoxScoreNote("Text.", 3, "regular"), `Text. ${NBA_NO_BOX_SCORE_NOTE}`);
  assert.equal(withNoBoxScoreNote("Text.", 1, "other"), `Text. ${NBA_NO_BOX_SCORE_STAGE_NOTE}`);
});

test("gamesAndFigures quotes the figures, or only the games when there are none", () => {
  assert.equal(gamesAndFigures("82 games", "27.1 points, 5.0 rebounds per game"), "82 games, 27.1 points, 5.0 rebounds per game");
  assert.equal(gamesAndFigures("4 games", null), "4 games");
});

test("the export card's footnote for the dagger", () => {
  assert.equal(NBA_NO_BOX_SCORE_CARD_NOTE, "† Includes games ESPN published no box score for.");
});
