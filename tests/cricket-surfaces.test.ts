// Every surface that names a cricket match's day or lists its sides must agree with the match page:
// the local date (games.local_date) and the batting-first order. The Boxing Day Test in Melbourne is
// "2025-12-25T23:30Z", so a surface that reads `date` alone prints Dec 25 where the match page says Dec 26.
process.env.TZ = "Australia/Sydney";

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { startTestDb, type TestDb } from "./helpers/testDb";
import { gameDayIso } from "../src/lib/gameDay";
import type { GameRow } from "../src/lib/queries";

let db: TestDb;
let queries: typeof import("../src/lib/queries");
let analytics: typeof import("../src/lib/analytics");
// These import the database module, which builds its pool from DATABASE_URL when first loaded: only after startTestDb.
let ScoreboardExportCard: typeof import("../src/components/ScoreboardExportCard").ScoreboardExportCard;
let TeamScheduleExportCard: typeof import("../src/components/TeamScheduleExportCard").TeamScheduleExportCard;
let SpotlightCard: typeof import("../src/components/SpotlightCard").SpotlightCard;
let GameCard: typeof import("../src/components/GameCard").GameCard;
before(async () => {
  db = await startTestDb();
  ({ ScoreboardExportCard } = await import("../src/components/ScoreboardExportCard"));
  ({ TeamScheduleExportCard } = await import("../src/components/TeamScheduleExportCard"));
  ({ SpotlightCard } = await import("../src/components/SpotlightCard"));
  ({ GameCard } = await import("../src/components/GameCard"));
  queries = await import("../src/lib/queries");
  analytics = await import("../src/lib/analytics");
  await db.pool.query(`insert into teams (league, espn_id, name, slug) values ('test','1','England','england'), ('test','2','Australia','australia')`);
  await db.pool.query(
    `insert into games (league, espn_id, date, name, home_team_espn_id, away_team_espn_id, home_score, away_score, season_year, completed, status_state, local_date, end_date) values
       ('test', '1455614', '2025-12-25T23:30:00Z', 'England v Australia', '1', '2', 4, 2, 2025, true, 'post', '2025-12-26', '2025-12-27')`
  );
  await db.pool.query(`insert into game_views (league, game_espn_id) values ('test', '1455614')`);
});
after(async () => {
  await (await import("../scripts/lib/db")).pool.end();
  await db?.stop();
});

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

test("the head-to-head and top-games rows carry the local date, so their cards say Dec 26", async () => {
  const h2h = await analytics.getHeadToHead("test", "england", "australia");
  assert.equal(h2h?.games[0].local_date, "2025-12-26");
  assert.equal(h2h?.games[0].end_date, "2025-12-27");
  const top = await queries.getTopGames("alltime", {}, 5);
  assert.equal(top[0].local_date, "2025-12-26");
  for (const g of [h2h!.games[0], top[0]]) {
    const html = renderToStaticMarkup(createElement(GameCard, { league: "test", game: g }));
    assert.match(text(html), /Dec 26/);
    assert.doesNotMatch(text(html), /Dec 25/);
  }
});

test("the scores share image's file name and year come from the local day, across a New Year", () => {
  // 1 Jan local, 31 Dec in UTC
  assert.equal(gameDayIso("2025-12-31T23:00:00Z", "wbbl", "2026-01-01"), "2026-01-01");
  assert.equal(gameDayIso("2025-12-31T23:00:00Z", "wbbl", "2026-01-01").slice(0, 4), "2026");
  assert.equal(gameDayIso("2025-12-31T23:00:00Z", "wbbl"), "2025-12-31");
});

const game = (over: Partial<GameRow> = {}): GameRow =>
  ({
    league: "ipl", espn_id: "1", date: "2025-05-04T14:00:00Z", name: "x", short_name: null,
    home_score: 147, away_score: 151, home_score_display: "147/9 (20 ov)", away_score_display: "151/1 (15.3/20 ov, target 148)", home_winner: false, away_winner: true,
    season_year: 2025, status_state: "post", status_detail: "Final", status_summary: "Punjab won by 9 wickets", round: null, completed: true,
    home_team_espn_id: "1", away_team_espn_id: "2",
    home_name: "Chennai", home_slug: "chennai", home_abbr: "CSK", home_logo: null, home_color: null,
    away_name: "Punjab", away_slug: "punjab", away_abbr: "PBKS", away_logo: null, away_color: null,
    ...over,
  }) as GameRow;
// Home (Chennai) batted first: its line has no target, the away side chased.
const before1st = (html: string) => html.search(/>Chennai</) < html.search(/>Punjab</);

test("the scoreboard, team schedule and spotlight list the side that batted first first, for cricket only", () => {
  const cards: [string, (g: GameRow, league: never) => string][] = [
    ["scoreboard tile", (g, league) => renderToStaticMarkup(createElement(ScoreboardExportCard, { league, title: "t", games: [g] }))],
    ["team schedule", (g, league) => renderToStaticMarkup(createElement(TeamScheduleExportCard, { league, teamName: "Chennai", teamLogo: null, teamColor: null, seasonLabel: "2025", games: [g] }))],
    ["spotlight", (g) => renderToStaticMarkup(createElement(SpotlightCard, { game: g }))],
  ];
  for (const [name, render] of cards) {
    assert.ok(before1st(render(game(), "ipl" as never)), `${name}: Chennai batted first, so it is listed first`);
    // the away side batted first: the usual order, the away side first
    const awayFirst = game({ home_score_display: "151/1 (15.3/20 ov, target 148)", away_score_display: "147/9 (20 ov)" });
    assert.ok(!before1st(render(awayFirst, "ipl" as never)), `${name}: the away side batted first, listed first`);
    // every other league keeps away-then-home, whatever the score lines say
    assert.ok(!before1st(render(game({ league: "nba" as never }), "nba" as never)), `${name}: nba unchanged`);
  }
});
