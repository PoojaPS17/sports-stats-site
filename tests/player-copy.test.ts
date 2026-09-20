// The NBA copy for games without a box score: exact strings, singular and plural.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BOX_ROWS_ONLY_NOTE,
  gamesAndFigures,
  nbaCardNote,
  nbaGamesStartedTitle,
  NBA_MILESTONES_NOTE,
  NBA_NO_BOX_SCORE_NOTE,
  NBA_NO_BOX_SCORE_SEASON_NOTE,
  NBA_NO_BOX_SCORE_STAGE_NOTE,
  NBA_NO_BOX_SCORE_TABLE_NOTE,
  NBA_REGULAR_SEASON_FOOTNOTE,
  noBoxScoreGamesTitle,
  seasonFiguresText,
  unlistedGamesNote,
  withBoxRowsNote,
  withMilestonesNote,
  withNoBoxScoreNote,
} from "../src/lib/playerCopy";

test("the section note names what the games count toward and what they leave out", () => {
  assert.equal(
    NBA_NO_BOX_SCORE_NOTE,
    "† ESPN's box scores have no stat line for some of this player's games. For those seasons the games, per-game averages and percentages are ESPN's own season figures where the site can use ESPN's row for the season; otherwise the games count includes them and the per-game averages and percentages cover only games with a box score (W-L is left blank). The game log, best games, splits and milestones below count only games with a box score."
  );
});

test("the season page's note reads for one season and leaves out milestones, which that page does not have", () => {
  assert.equal(
    NBA_NO_BOX_SCORE_SEASON_NOTE,
    "† ESPN's box scores have no stat line for some of this player's games. For this season the games, per-game averages and percentages are ESPN's own season figures where the site can use ESPN's row for the season; otherwise the games count includes them and the per-game averages and percentages cover only games with a box score (W-L is left blank). The game log, best games and splits below count only games with a box score."
  );
  assert.equal(NBA_NO_BOX_SCORE_SEASON_NOTE.includes("milestones"), false);
});

test("the short pointer above the main page's season table", () => {
  assert.equal(NBA_NO_BOX_SCORE_TABLE_NOTE, "† marks seasons with games that have no box score; see the note above.");
});

test("noBoxScoreGamesTitle: ESPN's own figure", () => {
  assert.equal(noBoxScoreGamesTitle(1, "espn"), "Includes 1 game without a box score.");
  assert.equal(noBoxScoreGamesTitle(2, "espn"), "Includes 2 games without a box score.");
});

test("noBoxScoreGamesTitle: a count from the game rosters says ESPN's figure is not stored", () => {
  const tail = "ESPN's own games-played figure is not stored for this season.";
  assert.equal(noBoxScoreGamesTitle(1, "listed"), `Includes 1 game without a box score, counted from the game rosters; ${tail}`);
  assert.equal(noBoxScoreGamesTitle(2, "listed"), `Includes 2 games without a box score, counted from the game rosters; ${tail}`);
  // Only "espn" is ESPN's figure; the logged source is worded like the listed one.
  assert.equal(noBoxScoreGamesTitle(2, "logged"), noBoxScoreGamesTitle(2, "listed"));
});

test("unlistedGamesNote agrees with the count", () => {
  assert.equal(unlistedGamesNote(1), "1 game without a box score is not listed.");
  assert.equal(unlistedGamesNote(2), "2 games without a box score are not listed.");
});

test("the playoffs and play-in note counts the games from the rosters and does not mention ESPN's own figure", () => {
  assert.equal(
    NBA_NO_BOX_SCORE_STAGE_NOTE,
    "ESPN's box scores have no stat line for some of this player's games. Those games are counted from the game rosters toward GP but not toward the per-game averages, the game log or the best games, and W-L is left blank for those seasons."
  );
  assert.equal(NBA_NO_BOX_SCORE_STAGE_NOTE.includes("ESPN's own figure"), false);
});

test("withNoBoxScoreNote appends the note for the stage, and only when some games have no box score", () => {
  assert.equal(withNoBoxScoreNote("Text.", 0, "regular"), "Text.");
  assert.equal(withNoBoxScoreNote("Text.", 0, "other"), "Text.");
  assert.equal(withNoBoxScoreNote("Text.", 3, "regular"), `Text. ${NBA_NO_BOX_SCORE_NOTE}`);
  assert.equal(withNoBoxScoreNote("Text.", 1, "other"), `Text. ${NBA_NO_BOX_SCORE_STAGE_NOTE}`);
  assert.equal(withNoBoxScoreNote("Text.", 2, "season"), `Text. ${NBA_NO_BOX_SCORE_SEASON_NOTE}`);
  assert.equal(withNoBoxScoreNote("Text.", 2, "table"), `Text. ${NBA_NO_BOX_SCORE_TABLE_NOTE}`);
  assert.equal(withNoBoxScoreNote("Text.", 0, "season"), "Text.");
  assert.equal(withNoBoxScoreNote("Text.", 0, "table"), "Text.");
});

test("gamesAndFigures quotes the figures, or only the games when there are none", () => {
  assert.equal(gamesAndFigures("82 games", "27.1 points, 5.0 rebounds per game"), "82 games, 27.1 points, 5.0 rebounds per game");
  assert.equal(gamesAndFigures("4 games", null), "4 games");
});

test("BOX_ROWS_ONLY_NOTE and withBoxRowsNote: the note follows the text only when some games have no box score", () => {
  assert.equal(BOX_ROWS_ONLY_NOTE, "Counts only games with a box score.");
  assert.equal(withBoxRowsNote("Text.", 0), "Text.");
  assert.equal(withBoxRowsNote("Text.", -1), "Text.");
  assert.equal(withBoxRowsNote("Text.", 1), "Text. Counts only games with a box score.");
  assert.equal(withBoxRowsNote("Text.", 2), "Text. Counts only games with a box score.");
});

test("the export card's footnote for the dagger says ESPN's figures when every short season is ESPN's, else that some averages are partial", () => {
  assert.equal(nbaCardNote(0), "† Includes games without a box score; the figures are ESPN's season figures.");
  assert.equal(nbaCardNote(1), "† Includes games without a box score; some averages count only games with a box score.");
  assert.equal(nbaCardNote(3), nbaCardNote(1));
});

test("the milestones note: game numbers count every game, the counts only games with a box score", () => {
  assert.equal(NBA_MILESTONES_NOTE, "Game numbers count every game played; the counts of 30-point games, double-doubles and so on cover only games with a box score.");
  assert.equal(withMilestonesNote("Text.", 0), "Text.");
  assert.equal(withMilestonesNote("Text.", 1), `Text. ${NBA_MILESTONES_NOTE}`);
  // The generic note would be untrue here: "First game on record" and the "Nth game" ordinals include games without a box score.
  assert.equal(NBA_MILESTONES_NOTE.includes(BOX_ROWS_ONLY_NOTE), false);
});

test("the page footnote is true whether or not the site could use ESPN's row for a season", () => {
  assert.equal(
    NBA_REGULAR_SEASON_FOOTNOTE,
    "Where the site can use ESPN's row for a season, that season's figures are ESPN's own; otherwise the games played include games without a box score and the per-game averages cover only games with a box score. The game log, best games, splits and milestones count only games with a box score."
  );
});

test("the season page's description: every game on record, or the games on record when some have no box score", () => {
  assert.equal(seasonFiguresText("2025-26", true, 0), "2025-26 regular-season figures from every game on record.");
  assert.equal(seasonFiguresText("2025-26", false, 0), "2025-26 figures from every game on record.");
  assert.equal(seasonFiguresText("2025-26", true, 3), "2025-26 regular-season figures from the games on record.");
  assert.equal(seasonFiguresText("2025-26", false, 1), "2025-26 figures from the games on record.");
});

test("the GS header tooltip: ESPN's count for an ESPN season, else box-score games only", () => {
  assert.equal(nbaGamesStartedTitle(true), "Games started. For a season shown from ESPN's season figures this is ESPN's count; for other seasons it counts only games with a box score.");
  assert.equal(nbaGamesStartedTitle(false), "Games started, counted only in games with a box score.");
});
