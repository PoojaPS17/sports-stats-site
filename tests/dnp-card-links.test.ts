// A box-score row for a player who did not play has no stats row behind it, so its performance card
// 404s (loadPerformanceCardData finds no log row — the scraper skips didNotPlay/empty rows). Game
// pages must not link to those cards: Googlebot was spending 1% of its crawl on them (536 404s in 90 days).
process.env.DATABASE_URL ??= "postgres://postgres:password@localhost:1/none";

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parseAmericanPlayerBox, playedInGame } from "../src/lib/matchDetail";
import { PlayerBoxScoreTable } from "../src/components/PlayerBoxScoreTable";

const CAPELA = { athleteId: "3102529", name: "Clint Capela", stats: ["29", "4-6", "0-0", "2-2", "10", "+5", "10"] };
const MAYS = { athleteId: "4397020", name: "Skylar Mays", stats: [] as string[] };

test("playedInGame mirrors the scraper's rule: no stats or a didNotPlay flag means no stats row exists", () => {
  assert.equal(playedInGame(CAPELA), true);
  assert.equal(playedInGame(MAYS), false);
  assert.equal(playedInGame({ ...CAPELA, didNotPlay: true }), false);
});

test("parseAmericanPlayerBox keeps ESPN's didNotPlay flag on the row, and only when it is set", () => {
  const summary = {
    boxscore: {
      players: [
        {
          team: { id: "1", displayName: "Atlanta Hawks" },
          statistics: [
            {
              labels: ["MIN", "PTS"],
              athletes: [
                { athlete: { id: "3102529", displayName: "Clint Capela" }, stats: ["29", "10"] },
                { athlete: { id: "4397020", displayName: "Skylar Mays" }, didNotPlay: true, reason: "COACH'S DECISION", stats: [] },
              ],
            },
          ],
        },
      ],
    },
  };
  const [team] = parseAmericanPlayerBox(summary);
  const [capela, mays] = team.categories[0].rows;
  assert.equal(capela.didNotPlay, undefined);
  assert.equal(mays.didNotPlay, true);
  assert.equal(playedInGame(mays), false);
});

test("the box-score table links a card only for players who played; a DNP row keeps its player link", () => {
  const html = renderToStaticMarkup(
    createElement(PlayerBoxScoreTable, {
      league: "nba",
      gameId: "401307584",
      team: { teamId: "1", teamName: "Atlanta Hawks", categories: [{ name: "", labels: ["MIN", "FG", "3PT", "FT", "REB", "+/-", "PTS"], rows: [CAPELA, MAYS] }] },
      playerSlugs: new Map([
        ["3102529", "clint-capela"],
        ["4397020", "skylar-mays"],
      ]),
    }),
  );
  assert.match(html, /href="\/nba\/games\/401307584\/players\/clint-capela"/);
  assert.doesNotMatch(html, /\/nba\/games\/401307584\/players\/skylar-mays/, "no card link or card image for a player who did not play");
  assert.match(html, /href="\/nba\/players\/skylar-mays"/, "the DNP row still links to the player page");
  assert.equal((html.match(/View full breakdown/g) ?? []).length, 1);
});
