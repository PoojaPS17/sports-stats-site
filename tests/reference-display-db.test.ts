import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { startTestDb, type TestDb } from "./helpers/testDb";
import type { GameRow } from "../src/lib/queries";

// The calendar feed and the league hub's off-season banner read the database, so these run against a throwaway
// Postgres (the app's pool is loaded after startTestDb).
let db: TestDb;
let ics: typeof import("../src/lib/ics");
let offseason: typeof import("../src/lib/offseason");
let OffseasonRecap: typeof import("../src/components/OffseasonRecap").OffseasonRecap;
let structuredData: typeof import("../src/lib/structuredData");

before(async () => {
  db = await startTestDb();
  ics = await import("../src/lib/ics");
  offseason = await import("../src/lib/offseason");
  ({ OffseasonRecap } = await import("../src/components/OffseasonRecap"));
  structuredData = await import("../src/lib/structuredData");
});
after(async () => {
  await (await import("../src/lib/db")).pool.end();
  await db?.stop();
});
beforeEach(async () => {
  await db.pool.query(`delete from games`);
  await db.pool.query(`delete from standings`);
});

/* ------------------------------------------------------------------------ */
/* Calendar feed and structured data                                         */
/* ------------------------------------------------------------------------ */

const game = (over: Partial<GameRow> = {}): GameRow =>
  ({
    league: "nfl", espn_id: "g1", date: "2027-01-10T05:00:00.000Z", name: "n", short_name: null, home_score: null, away_score: null, home_score_display: null, away_score_display: null,
    home_winner: null, away_winner: null, season_year: 2026, status_state: "pre", status_detail: "1/10 - TBD", status_summary: null, round: null, stage: "regular", competition_type: "STD", completed: false,
    home_team_espn_id: "1", away_team_espn_id: "2", home_name: "New York Jets", home_slug: "nyj", home_abbr: "NYJ", home_logo: null, home_color: null,
    away_name: "Green Bay Packers", away_slug: "gb", away_abbr: "GB", away_logo: null, away_color: null, ...over,
  }) as GameRow;

test("calendar: an NFL game with no kickoff time is an all-day event on the league's day, with no clock time", () => {
  const text = ics.buildIcs("Jets", "d", [ics.gameEvent("nfl", game())]);
  assert.match(text, /DTSTART;VALUE=DATE:20270110\r\n/);
  assert.match(text, /DTEND;VALUE=DATE:20270111\r\n/);
  assert.doesNotMatch(text, /DTSTART:|DTEND:/);
  assert.match(text, /Kickoff time to be announced/);
  // a game with a real kickoff is unchanged: a timed event
  const timed = ics.buildIcs("Jets", "d", [ics.gameEvent("nfl", game({ date: "2027-01-10T18:00:00.000Z", status_detail: "Scheduled" }))]);
  assert.match(timed, /DTSTART:20270110T180000Z/);
  assert.match(timed, /DTEND:20270110T211500Z/);
});

test("calendar: a game that went to overtime says Final/OT, and a play-in game says so", () => {
  const done = game({ completed: true, status_state: "post", status_detail: "Final/OT", home_score: 20, away_score: 17, stage: "playin", league: "nba" });
  const text = ics.buildIcs("x", "d", [ics.gameEvent("nba", done)]);
  assert.match(text, /Play-In/);
  assert.match(text, /Final\/OT/);
});

test("structured data: an unset kickoff carries a date only; a real one carries its zoned time", () => {
  assert.equal(structuredData.gameSchema("nfl", game()).startDate, "2027-01-10");
  assert.equal(structuredData.gameSchema("nfl", game({ date: "2027-01-10T18:00:00.000Z", status_detail: "Scheduled" })).startDate, "2027-01-10T13:00:00-05:00");
});

/* ------------------------------------------------------------------------ */
/* League hub: "season ended" only when it has                               */
/* ------------------------------------------------------------------------ */

const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString();

async function team(league: string, id: string) {
  await db.pool.query(`insert into teams (league, espn_id, name, slug) values ($1, $2, $3, $2) on conflict do nothing`, [league, id, `Team ${id}`]);
}
async function standing(league: string, season: number, id: string, wins: number, draws: number, losses: number) {
  await team(league, id);
  await db.pool.query(`insert into standings (league, season, team_espn_id, wins, losses, draws, win_percent, points) values ($1,$2,$3,$4,$5,$6,0,$7)`, [league, season, id, wins, losses, draws, wins * 3 + draws]);
}
let seq = 0;
async function match(league: string, season: number, home: string, away: string, when: string, completed: boolean, opts: { round?: string; detail?: string } = {}) {
  await team(league, home);
  await team(league, away);
  seq += 1;
  await db.pool.query(
    `insert into games (league, espn_id, date, name, season_year, home_team_espn_id, away_team_espn_id, home_score, away_score, home_winner, away_winner, completed, round, status_state, status_detail)
     values ($1,$2,$3,'x',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
    [league, `m${seq}`, when, season, home, away, completed ? 2 : null, completed ? 1 : null, completed ? true : null, completed ? false : null, completed, opts.round ?? null, completed ? "post" : "pre", opts.detail ?? (completed ? "FT" : "Scheduled")]
  );
}

test("seasonIsOver: cup final, complete domestic table, or nothing left to play", () => {
  const base = { cup: false, finalPlayed: false, domesticTableComplete: false, hasFutureFixture: true };
  assert.equal(offseason.seasonIsOver(base), false);
  assert.equal(offseason.seasonIsOver({ ...base, cup: true, finalPlayed: true }), true);
  assert.equal(offseason.seasonIsOver({ ...base, finalPlayed: true }), false, "a final only ends a cup competition");
  assert.equal(offseason.seasonIsOver({ ...base, domesticTableComplete: true }), true);
  assert.equal(offseason.seasonIsOver({ ...base, hasFutureFixture: false }), true);
});

test("a Champions League season between matchdays is in progress, not ended", async () => {
  await standing("ucl", 2026, "1", 1, 0, 0);
  await standing("ucl", 2026, "2", 0, 0, 1);
  await match("ucl", 2026, "1", "2", day(-10), true);
  await match("ucl", 2026, "2", "1", day(20), false);
  const recap = await offseason.getOffseasonRecap("ucl");
  assert.ok(recap);
  assert.equal(recap.seasonOver, false);
  assert.ok(recap.nextFixtureOn);
  assert.equal(recap.champion, null);
  const html = renderToStaticMarkup(createElement(OffseasonRecap, { league: "ucl", recap }));
  assert.doesNotMatch(html, /ended on|Between seasons/);
  assert.match(html, /in progress\. Next matchday: /);
});

test("a postponed fixture in the future does not keep a finished season open", async () => {
  await standing("ucl", 2026, "1", 1, 0, 0);
  await standing("ucl", 2026, "2", 0, 0, 1);
  await match("ucl", 2026, "1", "2", day(-10), true);
  await match("ucl", 2026, "2", "1", day(20), false, { detail: "Postponed" });
  const recap = await offseason.getOffseasonRecap("ucl");
  assert.ok(recap);
  assert.equal(recap.seasonOver, true);
  assert.match(renderToStaticMarkup(createElement(OffseasonRecap, { league: "ucl", recap })), /season ended on/);
});

test("only a called-off fixture is ignored when finding the next matchday: the site's one definition of postponed or cancelled", async () => {
  await standing("ucl", 2026, "1", 1, 0, 0);
  await standing("ucl", 2026, "2", 0, 0, 1);
  await match("ucl", 2026, "1", "2", day(-10), true);
  // ESPN's status text for a fixture still to be played is its date and time; a called-off one names why
  await match("ucl", 2026, "2", "1", day(9), false, { detail: "Postponed" });
  await match("ucl", 2026, "2", "1", day(11), false, { detail: "Canceled" });
  const off = await offseason.getOffseasonRecap("ucl");
  assert.ok(off);
  assert.equal(off.seasonOver, true, "only called-off games are left");
  await match("ucl", 2026, "1", "2", day(14), false, { detail: "Sat, September 26th at 3:00 PM EDT" });
  const on = await offseason.getOffseasonRecap("ucl");
  assert.ok(on);
  assert.equal(on.seasonOver, false);
  assert.equal(on.nextFixtureOn?.slice(0, 10), day(14).slice(0, 10), "the next fixture is the real one, not the postponed dates before it");
});

test("a followed game's card reads its play-in stage from the row the follows API serves", async () => {
  const { getGameByEspnId } = await import("../src/lib/queries");
  const { GameCard } = await import("../src/components/GameCard");
  await team("nba", "1");
  await team("nba", "2");
  await db.pool.query(
    `insert into games (league, espn_id, date, name, season_year, home_team_espn_id, away_team_espn_id, home_score, away_score, completed, season_type, competition_type, status_state, status_detail)
     values ('nba','pi1',$1,'x',2026,'1','2',101,99,true,5,'STD','post','Final/OT')`,
    [day(-3)]
  );
  const g = await getGameByEspnId("nba", "pi1");
  assert.ok(g);
  const html = renderToStaticMarkup(createElement(GameCard, { league: "nba", game: g }));
  assert.match(html, />Play-In · Final\/OT</);
});

test("a cup whose final has been played is over even with a stray fixture in the database", async () => {
  await standing("ucl", 2026, "1", 1, 0, 0);
  await standing("ucl", 2026, "2", 0, 0, 1);
  await match("ucl", 2026, "1", "2", day(-30), true, { round: "Final" });
  await match("ucl", 2026, "2", "1", day(20), false);
  const recap = await offseason.getOffseasonRecap("ucl");
  assert.ok(recap);
  assert.equal(recap.seasonOver, true);
  assert.equal(recap.nextFixtureOn, null);
  assert.equal(recap.champion?.name, "Team 1");
});

test("a season with every game played is over, and says when it ended", async () => {
  await standing("nba", 2026, "1", 1, 0, 0);
  await standing("nba", 2026, "2", 0, 0, 1);
  await match("nba", 2026, "1", "2", day(-60), true);
  const recap = await offseason.getOffseasonRecap("nba");
  assert.ok(recap);
  assert.equal(recap.seasonOver, true);
  assert.match(renderToStaticMarkup(createElement(OffseasonRecap, { league: "nba", recap })), /season ended on/);
});

test("a domestic league with a complete table is over; with an incomplete table and games to come it is not", async () => {
  // four clubs, each played the full 6 of a double round robin
  for (const [id, w, d, l] of [["1", 4, 1, 1], ["2", 3, 1, 2], ["3", 2, 1, 3], ["4", 1, 1, 4]] as const) await standing("epl", 2026, id, w, d, l);
  await match("epl", 2026, "1", "2", day(-5), true);
  await match("epl", 2026, "3", "4", day(10), false);
  const complete = await offseason.getOffseasonRecap("epl");
  assert.ok(complete);
  assert.equal(complete.seasonOver, true);
  assert.equal(complete.champion?.name, "Team 1");

  await db.pool.query(`update standings set wins = wins - 1 where league = 'epl' and team_espn_id = '1'`);
  const partial = await offseason.getOffseasonRecap("epl");
  assert.ok(partial);
  assert.equal(partial.seasonOver, false);
  assert.equal(partial.champion, null);
  assert.ok(partial.nextFixtureOn);
});

/* ------------------------------------------------------------------------ */
/* Head-to-head strip on a match page                                         */
/* ------------------------------------------------------------------------ */

async function seedMeetings(league: string) {
  for (const [id, name, abbr] of [["701", "Manchester City", "MCI"], ["702", "Sunderland", "SUN"]]) {
    await db.pool.query(`insert into teams (league, espn_id, name, slug, abbreviation) values ($1, $2, $3, $4, $5) on conflict do nothing`, [league, id, name, name.toLowerCase().replace(/ /g, "-"), abbr]);
  }
  // three finished meetings: Manchester City (home) win twice, Sunderland (away at City, then home) win once
  const meet = (id: string, days: number, home: string, away: string, hs: number, as: number) =>
    db.pool.query(
      `insert into games (league, espn_id, date, name, season_year, home_team_espn_id, away_team_espn_id, home_score, away_score, home_winner, away_winner, completed, season_type, competition_type, status_state, status_detail)
       values ($1,$2,$3,'x',2026,$4,$5,$6::int,$7::int,$6::int > $7::int,$7::int > $6::int,true,2,'STD','post','Final')`,
      [league, id, day(-days), home, away, hs, as]
    );
  await meet("h1", 30, "701", "702", 2, 0);
  await meet("h2", 20, "701", "702", 3, 1);
  await meet("h3", 10, "702", "701", 2, 1);
}

test("the head-to-head strip lists football's home side first with its own wins, and the NBA's visitors first", async () => {
  const { HeadToHeadStrip } = await import("../src/components/HeadToHeadStrip");
  const strip = async (league: string) => {
    await seedMeetings(league);
    const element = await HeadToHeadStrip({ league: league as never, homeSlug: "manchester-city", awaySlug: "sunderland", excludeGameId: null });
    assert.ok(element);
    return renderToStaticMarkup(element).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
  };
  // Manchester City are at home on the match page. City won 2 of the 3 meetings, Sunderland 1, none drawn.
  assert.match(await strip("epl"), /Head-to-head MCI 2 · 0 · 1 SUN/);
  assert.match(await strip("nba"), /Head-to-head SUN 1 · 2 MCI/, "the NBA lists the visitors first, as its match header does");
});
