// NBA neutral-site games (kept out of the Home and Away views, as ESPN does) and NBA Cup labels.
// Fixtures are real ESPN shapes: 2025-26 event 401810002 "DAL VS DET" (Mexico City, neutralSite true, note
// "NBA Mexico City Game 2025"), 401809789 (Cup group play), 401809838 (Cup semifinal), 401809839 (Cup final).
import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { startTestDb, type TestDb } from "./helpers/testDb";
import { cupNoteLabel } from "../src/lib/gameNote";
import { finishedPillLabel, gameRoundLabel } from "../src/lib/stage";
import type { ComputedTableRow, ResultRow, TeamRef } from "../src/lib/analytics";
import { buildProfile, type PlayerLogRow, type Stats } from "../src/lib/playerProfile";
import { StatusPill } from "../src/components/StatusPill";
import { gameAccessibleLabel, scoreboardTileStatus } from "../src/lib/gameDisplay";
import type { Matchweek } from "../src/lib/matchweeks";
import type { GameRow } from "../src/lib/queries";

let db: TestDb;
let games: typeof import("../scripts/lib/games");
let analytics: typeof import("../src/lib/analytics");
before(async () => {
  db = await startTestDb();
  games = await import("../scripts/lib/games");
  analytics = await import("../src/lib/analytics");
});
after(async () => {
  await db?.stop();
});
beforeEach(async () => {
  await db.pool.query("delete from games");
});

/* ------------------------------------------------------------------------ */
/* The label helper                                                          */
/* ------------------------------------------------------------------------ */

test("cupNoteLabel: group play, quarterfinal and semifinal read as short labels", () => {
  assert.equal(cupNoteLabel({ note: "NBA Cup - Group Play" }), "NBA Cup · Group play");
  assert.equal(cupNoteLabel({ note: "Emirates NBA Cup - Group Play - East Group A" }), "NBA Cup · Group play");
  assert.equal(cupNoteLabel({ note: "NBA Cup - Quarterfinals" }), "NBA Cup quarterfinal");
  assert.equal(cupNoteLabel({ note: "NBA Cup - Semifinals" }), "NBA Cup semifinal");
  assert.equal(cupNoteLabel({ note: "NBA Cup Semifinal" }), "NBA Cup semifinal");
});

test("cupNoteLabel: the 2023-24 tournament keeps its name of the time", () => {
  assert.equal(cupNoteLabel({ note: "NBA In-Season Tournament - Group Play" }), "In-Season Tournament · Group play");
  assert.equal(cupNoteLabel({ note: "NBA In-Season Tournament - Semifinals" }), "In-Season Tournament semifinal");
});

test("cupNoteLabel: no label for no note, another kind of note, or the final (the final is the competition type's)", () => {
  assert.equal(cupNoteLabel({ note: null }), null);
  assert.equal(cupNoteLabel({}), null);
  assert.equal(cupNoteLabel({ note: "" }), null);
  assert.equal(cupNoteLabel({ note: "NBA Mexico City Game 2025" }), null);
  assert.equal(cupNoteLabel({ note: "Makeup date Jan 25" }), null);
  assert.equal(cupNoteLabel({ note: "NBA Cup Championship", competition_type: "CC" }), null);
  assert.equal(cupNoteLabel({ note: "NBA Cup - Group Play", competition_type: "CC" }), null);
});

test("gameRoundLabel: a round or play-in/Cup-final label outranks the note; the note fills the rest", () => {
  const note = "NBA Cup - Semifinals";
  assert.equal(gameRoundLabel({ round: null, stage: "regular", competition_type: "STD", note }), "NBA Cup semifinal");
  assert.equal(gameRoundLabel({ round: null, stage: "regular", competition_type: "STD", note: "NBA Cup - Group Play" }), "NBA Cup · Group play");
  assert.equal(gameRoundLabel({ round: "East 1st Round - Game 3", stage: "playoffs", competition_type: "QTR", note }), "East 1st Round - Game 3");
  assert.equal(gameRoundLabel({ round: null, stage: "excluded", competition_type: "CC", note: "NBA Cup Championship" }), "NBA Cup final");
  assert.equal(gameRoundLabel({ round: null, stage: "regular", competition_type: "STD", note: null }), null);
  assert.equal(gameRoundLabel({ round: null, stage: "regular" }), null, "a row from a query that does not select the note");
});

test("a finished Cup group game says so on its pill, with overtime after it", () => {
  const g = { round: null, stage: "regular", competition_type: "STD", note: "NBA Cup - Group Play" };
  assert.equal(finishedPillLabel("nba", { ...g, status_detail: "Final" }), "NBA Cup · Group play");
  assert.equal(finishedPillLabel("nba", { ...g, status_detail: "Final/OT" }), "NBA Cup · Group play · Final/OT");
  assert.equal(finishedPillLabel("nba", { round: null, stage: "regular", competition_type: "STD", note: null, status_detail: "Final" }), "Final");
});

test("StatusPill shows the Cup label for a finished, live and upcoming group game, and nothing extra for a plain one", () => {
  const pill = (props: Record<string, unknown>) =>
    renderToStaticMarkup(createElement(StatusPill, { date: "2025-11-15T02:30:00.000Z", statusState: "post", statusDetail: "Final", completed: true, league: "nba", stage: "regular", competitionType: "STD", ...props } as never));
  assert.match(pill({ note: "NBA Cup - Group Play" }), />NBA Cup · Group play</);
  assert.match(pill({ note: "NBA Cup - Semifinals" }), />NBA Cup semifinal</);
  assert.match(pill({ note: "NBA Cup - Group Play", statusState: "in", completed: false }), /NBA Cup · Group play/);
  assert.match(pill({ note: "NBA Cup - Group Play", statusState: "pre", statusDetail: "Scheduled", completed: false }), /NBA Cup · Group play/);
  assert.match(pill({}), />Final</);
});

/* ------------------------------------------------------------------------ */
/* Storing neutralSite and the note                                          */
/* ------------------------------------------------------------------------ */

function side(id: string, name: string, home: boolean, score: string) {
  return { homeAway: home ? "home" : "away", score, winner: home, team: { id, displayName: name, abbreviation: name.slice(0, 3).toUpperCase() } };
}
function event(id: string, opts: { neutral?: boolean; headline?: string; feed?: "scoreboard" | "schedule"; comp?: string } = {}) {
  return {
    id,
    date: "2025-12-14T02:00:00Z",
    name: "San Antonio Spurs vs Oklahoma City Thunder",
    ...(opts.feed === "schedule" ? { season: { year: 2026 }, seasonType: { type: 2 } } : { season: { year: 2026, type: 2 } }),
    competitions: [
      {
        type: { abbreviation: opts.comp ?? "STD" },
        ...(opts.neutral === undefined ? {} : { neutralSite: opts.neutral }),
        competitors: [side("1", "Alpha", true, "100"), side("2", "Bravo", false, "90")],
        status: { type: { state: "post", completed: true, detail: "Final" } },
        ...(opts.headline ? { notes: [{ type: "event", headline: opts.headline }] } : {}),
      },
    ],
  };
}
const stored = async (id: string) => (await db.pool.query(`select neutral_site, note from games where league = 'nba' and espn_id = $1`, [id])).rows[0];

test("parseNeutralSite and parseNote read the competition, and say nothing when the feed does not", () => {
  assert.equal(games.parseNeutralSite(event("x", { neutral: true })), true);
  assert.equal(games.parseNeutralSite(event("x", { neutral: false })), false);
  assert.equal(games.parseNeutralSite(event("x")), null);
  assert.equal(games.parseNote(event("x", { headline: "NBA Cup - Group Play" })), "NBA Cup - Group Play");
  assert.equal(games.parseNote(event("x")), null);
  assert.equal(games.parseNote({ competitions: [{ notes: [{ type: "other", headline: "y" }] }] }), null);
});

test("upsertEvent stores neutralSite true and the note headline, from either feed", async () => {
  await games.upsertEvent("nba", event("n1", { neutral: true, headline: "NBA Cup - Semifinals" }));
  await games.upsertEvent("nba", event("n2", { neutral: true, headline: "NBA Mexico City Game 2025", feed: "schedule" }));
  assert.deepEqual(await stored("n1"), { neutral_site: true, note: "NBA Cup - Semifinals" });
  assert.deepEqual(await stored("n2"), { neutral_site: true, note: "NBA Mexico City Game 2025" });
});

test("an ordinary game stores false, and a game whose feed says nothing stores null", async () => {
  await games.upsertEvent("nba", event("o1", { neutral: false }));
  await games.upsertEvent("nba", event("o2"));
  assert.deepEqual(await stored("o1"), { neutral_site: false, note: null });
  assert.deepEqual(await stored("o2"), { neutral_site: null, note: null });
});

test("a re-upsert updates neutral_site and note, and a sparser feed never erases them", async () => {
  await games.upsertEvent("nba", event("u", { neutral: false }));
  await games.upsertEvent("nba", event("u", { neutral: true, headline: "NBA Cup - Semifinals" }));
  assert.deepEqual(await stored("u"), { neutral_site: true, note: "NBA Cup - Semifinals" });
  await games.upsertEvent("nba", event("u"));
  assert.deepEqual(await stored("u"), { neutral_site: true, note: "NBA Cup - Semifinals" });
});

/* ------------------------------------------------------------------------ */
/* Home and Away tables leave neutral-site games out                         */
/* ------------------------------------------------------------------------ */

const team = (id: string): TeamRef => ({ espn_id: id, name: `Team ${id}`, slug: `t${id}`, abbreviation: null, logo_url: null, color: null });
const result = (id: string, home: string, away: string, hs: number, as: number, neutral?: boolean): ResultRow => ({
  espn_id: id, date: `2025-11-0${id}T00:00:00Z`, season_year: 2026, round: null, home_team_espn_id: home, away_team_espn_id: away, home_score: hs, away_score: as,
  ...(neutral === undefined ? {} : { neutral_site: neutral }),
});
const teams = new Map(["A", "B"].map((id) => [id, team(id)]));
const played = (rows: ComputedTableRow[]) => Object.fromEntries(rows.map((r) => [r.team.espn_id, `${r.played}:${r.wins}-${r.losses}`]));

test("computeTable: the Home and Away tables skip a neutral-site game, Overall and Form count it", () => {
  const results = [result("1", "A", "B", 100, 90, false), result("2", "B", "A", 80, 95, false), result("3", "A", "B", 101, 99, true)];
  assert.deepEqual(played(analytics.computeTable("nba", results, teams, "overall")), { A: "3:3-0", B: "3:0-3" });
  assert.deepEqual(played(analytics.computeTable("nba", results, teams, "home")), { A: "1:1-0", B: "1:0-1" }, "A's home record is the one home game, B's the one home game");
  assert.deepEqual(played(analytics.computeTable("nba", results, teams, "away")), { A: "1:1-0", B: "1:0-1" });
  assert.equal(analytics.computeTable("nba", results, teams, "form").find((r) => r.team.espn_id === "A")!.played, 3);
});

test("computeTable: a game with no neutral flag (unfilled, or a league without one) still counts as a home game", () => {
  const results = [result("1", "A", "B", 100, 90), result("2", "A", "B", 100, 90, false)];
  assert.deepEqual(played(analytics.computeTable("nba", results, teams, "home")), { A: "2:2-0" });
});

test("getComputedTable reads neutral_site from the games table", async () => {
  for (const [id, name] of [["1", "Alpha"], ["2", "Bravo"]]) await db.pool.query(`insert into teams (league, espn_id, name, slug) values ('nba', $1, $2, $2) on conflict do nothing`, [id, name]);
  const ins = (id: string, neutral: boolean | null) =>
    db.pool.query(
      `insert into games (league, espn_id, date, name, season_year, home_team_espn_id, away_team_espn_id, home_score, away_score, completed, season_type, competition_type, neutral_site)
       values ('nba', $1, $3::timestamptz, 'x', 2026, '1', '2', 100, 90, true, 2, 'STD', $2)`,
      [id, neutral, `2025-11-0${id}T00:00:00Z`]
    );
  await ins("1", false);
  await ins("2", null);
  await ins("3", true);
  const wl = async (scope: "overall" | "home" | "away") => Object.fromEntries((await analytics.getComputedTable("nba", 2026, scope)).map((r) => [r.team.espn_id, r.played]));
  assert.deepEqual(await wl("overall"), { 1: 3, 2: 3 });
  assert.deepEqual(await wl("home"), { 1: 2 });
  assert.deepEqual(await wl("away"), { 2: 2 });
});

/* ------------------------------------------------------------------------ */
/* A player's Home and Away split: ESPN's leaves the neutral-site game out   */
/* ------------------------------------------------------------------------ */

function logRow(id: string, isHome: boolean, neutral?: boolean): PlayerLogRow {
  const stats: Stats = { box: { MIN: "30", PTS: "20", REB: "5", AST: "5" } };
  return {
    game_espn_id: id, date: `2025-11-0${id}`, season_year: 2026, round: null, week: null, stage: "regular", season_type: 2, competition_type: "STD",
    is_home: isHome, ...(neutral === undefined ? {} : { neutral_site: neutral }), team_espn_id: "1", team_name: "Home", team_slug: "home", team_abbr: "HOM", team_logo: null,
    opponent_espn_id: "2", opponent_name: "Away", opponent_slug: "away", opponent_abbr: "AWY", opponent_logo: null,
    team_score: 100, opponent_score: 90, result: "W", stats,
  };
}

test("a player's Home and Away splits leave out a neutral-site game; the season counts it", () => {
  const profile = buildProfile("nba", [logRow("1", true, false), logRow("2", false, false), logRow("3", true, true), logRow("4", false)]);
  const games = (key: string) => profile.homeAway.find((s) => s.key === key)!.games;
  assert.equal(profile.seasons[0].games, 4);
  assert.equal(games("home"), 1);
  assert.equal(games("away"), 2, "a row with no neutral flag stays where it was");
});

/* ------------------------------------------------------------------------ */
/* Fix round 1: the weekly tally, the note on every game select, other surfaces */
/* ------------------------------------------------------------------------ */

const weekGame = (id: string, hs: number, as: number, neutral?: boolean | null): GameRow =>
  ({ espn_id: id, league: "nba", completed: true, status_state: "post", status_detail: "Final", home_score: hs, away_score: as, ...(neutral === undefined ? {} : { neutral_site: neutral }) }) as GameRow;
const weekOf = (gs: GameRow[]) => ({ games: gs, calledOff: 0 }) as unknown as Matchweek;

test("summarizeWeek: a neutral-site game is neither a home win nor an away win, and null or false counts as before", async () => {
  const { summarizeWeek } = await import("../src/lib/matchweeks");
  const s = summarizeWeek(weekOf([weekGame("1", 100, 90, false), weekGame("2", 90, 100, null), weekGame("3", 101, 99), weekGame("4", 105, 95, true), weekGame("5", 90, 100, true)]));
  assert.equal(s.played, 5);
  assert.equal(s.homeWins, 2, "games 1 and 3");
  assert.equal(s.awayWins, 1, "game 2");
  assert.equal(s.neutral, 2, "games 4 and 5, counted apart");
  assert.equal(s.homeWins + s.awayWins + s.neutral + s.draws, s.played);
  assert.equal(s.totalScore, 190 + 190 + 200 + 200 + 190, "a neutral game still counts toward played and points");
});

const CUP = "NBA Cup - Group Play";
async function seedCupGame() {
  for (const [id, name] of [["1", "Alpha"], ["2", "Bravo"]]) await db.pool.query(`insert into teams (league, espn_id, name, slug) values ('nba', $1, $2, $3) on conflict do nothing`, [id, name, name.toLowerCase()]);
  await db.pool.query(
    `insert into games (league, espn_id, date, name, season_year, home_team_espn_id, away_team_espn_id, home_score, away_score, completed, season_type, competition_type, status_state, status_detail, note, neutral_site)
     values ('nba', 'cup1', now() - interval '1 day', 'x', 2026, '1', '2', 100, 90, true, 2, 'STD', 'post', 'Final', $1, true)`,
    [CUP]
  );
  await db.pool.query(`insert into game_views (league, game_espn_id) values ('nba', 'cup1')`);
}

test("the note and neutral flag come back from every select that builds a GameRow the cards use", async () => {
  await seedCupGame();
  const queries = await import("../src/lib/queries");
  const h2h = await analytics.getHeadToHead("nba", "alpha", "bravo");
  const selects: [string, GameRow | undefined][] = [
    ["getGameByEspnId", (await queries.getGameByEspnId("nba", "cup1")) ?? undefined],
    ["getSeasonGames (GAME_SELECT)", (await (await import("../src/lib/matchweeks")).getSeasonGames("nba", 2026))[0]],
    ["getTopGames", (await queries.getTopGames("alltime"))[0]],
    ["getHeadToHead", h2h?.games[0]],
  ];
  for (const [name, g] of selects) {
    assert.ok(g, `${name} returned the game`);
    assert.equal(g.note, CUP, `${name} carries the note`);
    assert.equal(gameRoundLabel(g), "NBA Cup · Group play", `${name} yields the Cup label`);
  }
  // the neutral flag is on GAME_SELECT rows (the weekly tally reads it)
  assert.equal(selects[1][1]!.neutral_site, true);
});

test("the calendar feed, the scoreboard tile and the accessible name carry the Cup label", async () => {
  const ics = await import("../src/lib/ics");
  const g = { league: "nba", espn_id: "c", date: "2025-11-15T02:30:00.000Z", completed: true, status_state: "post", status_detail: "Final", status_summary: null, round: null, stage: "regular", competition_type: "STD", note: CUP, home_score: 100, away_score: 90, home_score_display: null, away_score_display: null, home_name: "Alpha", away_name: "Bravo", home_team_espn_id: "1", away_team_espn_id: "2" } as unknown as GameRow;
  const event = ics.gameEvent("nba", g);
  assert.match(event.description ?? "", /NBA Cup · Group play/);
  assert.equal(scoreboardTileStatus("nba", g, false), "NBA Cup · Group play");
  assert.equal(scoreboardTileStatus("nba", g, true), "Nov 14, 2025 · NBA Cup · Group play");
  assert.equal(gameAccessibleLabel("nba", g), "Bravo 90, Alpha 100, NBA Cup · Group play, final");
  assert.equal(gameAccessibleLabel("nba", { ...g, note: null }), "Bravo 90, Alpha 100, final");
  assert.equal(gameAccessibleLabel("nba", { ...g, note: null, stage: "playin" }), "Bravo 90, Alpha 100, Play-In, final");
  assert.equal(gameAccessibleLabel("nba", { ...g, status_detail: "Final/OT" }), "Bravo 90, Alpha 100, NBA Cup · Group play · Final/OT");
});
