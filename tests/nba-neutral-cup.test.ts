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
