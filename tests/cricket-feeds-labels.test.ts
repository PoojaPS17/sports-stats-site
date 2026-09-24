// A cricket label or side order must read the same on every surface: the match page, the share image,
// the calendar feed and the structured data. Finished cricket is a "Result" (or its stage), never "Final";
// the batting-first side is listed first (from the scorecard where the surface has one, else the score
// lines, else away first); every other sport's output is byte-for-byte what it was.
process.env.DATABASE_URL ??= "postgres://postgres:password@localhost:1/none";

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { shareImageModel, shareImageStatus, scoresImageDay } from "../src/lib/gameDisplay";
import { venueWithCity } from "../src/components/MatchFacts";
import { gameEvent } from "../src/lib/ics";
import { gameSchema } from "../src/lib/structuredData";
import type { GameRow } from "../src/lib/queries";
import type { CricketTeamScorecard } from "../src/lib/matchDetail";

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
const src = (path: string) => readFileSync(path, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

/* ---- the share image route ------------------------------------------------ */

test("the share image's label and order come from one helper the route calls, and cricket is Result / batting-first", () => {
  // Chennai (home) batted first: the score lines say it (Punjab's line carries the target)
  assert.deepEqual(shareImageModel(game()), { status: "Result", order: ["home", "away"] });
  assert.deepEqual(shareImageModel(game({ round: "Qualifier 1" })), { status: "Qualifier 1", order: ["home", "away"] });
  assert.equal(shareImageModel(game({ round: "Final" })).status, "Final");
  // a Test has no score-line fallback; its stored scorecard says who batted first (Australia, id 2, here)
  const card = (firstId: string): CricketTeamScorecard[] =>
    ["1", "2"].map((id) => ({ teamId: id, teamName: id, battingLabels: [], bowlingLabels: [], battingRows: [{ athleteId: id, name: id, stats: [], innings: id === firstId ? 1 : 2 }], bowlingRows: [] }));
  const test1 = game({ league: "test", home_score_display: "132 & 4/0", away_score_display: "152 & 110" });
  assert.deepEqual(shareImageModel(test1), { status: "Result", order: ["away", "home"] });
  assert.deepEqual(shareImageModel(test1, card("1")), { status: "Result", order: ["home", "away"] });
  assert.deepEqual(shareImageModel(test1, card("2")).order, ["away", "home"]);
  // other sports: "Final", and cricket's score-line fallback never leaks into them -- the NBA and NFL list the
  // visitors first, football lists the home side first (Task 4's reference-checked order), whatever the score
  // lines say. Chennai is the home side here.
  assert.deepEqual(shareImageModel(game({ league: "nba" as never })), { status: "Final", order: ["away", "home"] });
  assert.deepEqual(shareImageModel(game({ league: "epl" as never })), { status: "Final", order: ["home", "away"] });
  assert.equal(shareImageStatus(game({ league: "nba" as never }), "nba"), "Final");
});

test("the image route asks shareImageModel for both, and the label helper cannot be called without a league", () => {
  const route = src("src/app/[league]/games/[id]/opengraph-image.tsx");
  assert.match(route, /shareImageModel\(game, scorecard\)/);
  assert.doesNotMatch(route, /shareImageStatus\(/, "no second, league-less path to the label");
  // `league` is a required parameter: this line does not compile if it is made optional again (tsc runs in CI)
  // @ts-expect-error a call without the league is a type error
  assert.ok(shareImageStatus(game()) !== undefined);
});

/* ---- the league page's scores share image --------------------------------- */

test("the scores image is filed by the first game's local day, across a New Year", () => {
  const nye = { date: "2025-12-31T23:00:00Z", local_date: "2026-01-01" };
  assert.deepEqual(scoresImageDay("wbbl", nye), { iso: "2026-01-01", year: "2026" });
  assert.deepEqual(scoresImageDay("wbbl", { date: nye.date, local_date: null }), { iso: "2025-12-31", year: "2025" });
  assert.deepEqual(scoresImageDay("nba", { date: "2026-06-08T02:00:00Z" }), { iso: "2026-06-07", year: "2026" });
});

test("the league page names its scores images through scoresImageDay and no longer reads the UTC day itself", () => {
  const page = src("src/app/[league]/page.tsx");
  // Computed once per day group and reused for the image filename, the export card subtitle, and
  // the "Full day" link to /[league]/scores/[date] — not recomputed at each call site.
  assert.equal((page.match(/scoresImageDay\(league, dayGames\[0\]\)/g) ?? []).length, 1);
  assert.doesNotMatch(page, /gameDayIso\(/);
});

/* ---- the live series match page's venue ------------------------------------ */

test("the venue line names the city once, on the series match page too", () => {
  assert.equal(venueWithCity("Wankhede Stadium, Mumbai", "Mumbai"), "Wankhede Stadium, Mumbai");
  assert.equal(venueWithCity("GB Oval, Szodliget, Budapest", "Szodliget"), "GB Oval, Szodliget, Budapest");
  assert.equal(venueWithCity("Melbourne Cricket Ground", "Melbourne"), "Melbourne Cricket Ground, Melbourne");
  assert.equal(venueWithCity("Kensington Oval", null), "Kensington Oval");
  const page = src("src/app/cricket/matches/[id]/page.tsx");
  assert.match(page, /venueWithCity\(details\.venue, details\.city\)/);
  assert.doesNotMatch(page, /`\$\{details\.venue\}, \$\{details\.city\}`/);
});

/* ---- the calendar feed -------------------------------------------------------- */

test("a finished cricket match in a calendar reads Result and lists the batting-first side first", () => {
  const ev = gameEvent("ipl", game());
  assert.equal(ev.summary, "Chennai 147/9 (20 ov) v Punjab 151/1 (15.3/20 ov, target 148)");
  assert.match(ev.description!, /\nResult: Punjab won by 9 wickets\n/);
  assert.doesNotMatch(ev.description!, /Final/);
  // the stage is its own line, and the result still says Result
  const final = gameEvent("ipl", game({ round: "Final" }));
  assert.match(final.description!, /\nFinal\nResult: Punjab won by 9 wickets\n/);
  // a row whose lines do not say (a Test, no target): away first, as a list row has no scorecard
  const t = gameEvent("test", game({ league: "test", home_score_display: "132 & 4/0", away_score_display: "152 & 110" }));
  assert.equal(t.summary, "Punjab 152 & 110 v Chennai 132 & 4/0");
  // an upcoming fixture and a called-off one keep their wording
  assert.equal(gameEvent("ipl", game({ completed: false, status_state: "pre", home_score: null, away_score: null })).summary, "Punjab at Chennai");
});

test("a calendar entry for any other sport is exactly what it was", () => {
  const nba = gameEvent("nba", game({ league: "nba" as never, round: null, home_score: 110, away_score: 105, home_score_display: null, away_score_display: null, status_summary: "Chennai win" }));
  assert.equal(nba.summary, "Punjab 105 @ Chennai 110");
  assert.match(nba.description!, /\nFinal: Chennai win\n/);
  const epl = gameEvent("epl", game({ league: "epl" as never, home_score: 2, away_score: 1, home_score_display: null, away_score_display: null, status_summary: null }));
  assert.equal(epl.summary, "Chennai 2–1 Punjab");
  assert.match(epl.description!, /\nFinal\n/);
});

/* ---- structured data ---------------------------------------------------------- */

test("cricket JSON-LD says Result, with the batting-first side first; other sports say Final score as before", () => {
  const ipl = gameSchema("ipl", game(), null) as { description?: string };
  assert.equal(ipl.description, "Result: Punjab won by 9 wickets. Chennai 147/9 (20 ov), Punjab 151/1 (15.3/20 ov, target 148).");
  assert.doesNotMatch(ipl.description!, /Final/);
  // with a scorecard, a Test's order comes from it
  const card: CricketTeamScorecard[] = ["1", "2"].map((id) => ({ teamId: id, teamName: id, battingLabels: [], bowlingLabels: [], battingRows: [{ athleteId: id, name: id, stats: [], innings: id === "1" ? 1 : 2 }], bowlingRows: [] }));
  const test1 = gameSchema("test", game({ league: "test", home_score_display: "132 & 4/0", away_score_display: "152 & 110" }), null, card) as { description?: string };
  assert.equal(test1.description, "Result: Punjab won by 9 wickets. Chennai 132 & 4/0, Punjab 152 & 110.");
  const nba = gameSchema("nba", game({ league: "nba" as never, home_score: 110, away_score: 105, home_score_display: null, away_score_display: null }), null) as { description?: string };
  assert.equal(nba.description, "Final score: Punjab 105, Chennai 110.");
  // Football names its home side first, as the accessible name and the cards do (Task 4); the NBA line above
  // keeps the visitors first. Chennai is home.
  const epl = gameSchema("epl", game({ league: "epl" as never, home_score: 2, away_score: 1, home_score_display: null, away_score_display: null }), null) as { description?: string };
  assert.equal(epl.description, "Final score: Chennai 2, Punjab 1.");
  // and the page passes its scorecard
  assert.match(src("src/app/[league]/games/[id]/page.tsx"), /gameSchema\(league, game, details\?\.venue \?\? null, details\?\.scorecard\)/);
});
