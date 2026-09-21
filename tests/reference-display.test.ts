import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { finalLabel, finishedPillLabel, gameRoundLabel, overtimeFinal } from "../src/lib/stage";
import { isTimeTbd } from "../src/lib/gameStatus";
import { formatMinute, presentDetails, type GameDetails } from "../src/lib/matchDetail";
import { joinTeams } from "../src/lib/teamName";
import { formatLocalTime } from "../src/lib/localTime";
import { gameAccessibleLabel, scheduleRowHeading, scoreboardTileStatus, shareImageStatus } from "../src/lib/gameDisplay";
import { scoreLineHomeFirst } from "../src/lib/gamePage";
import { StatusPill } from "../src/components/StatusPill";
import { LocalTime } from "../src/components/LocalTime";
import { GameCard } from "../src/components/GameCard";
import type { GameRow } from "../src/lib/queries";

process.env.TZ = "America/Los_Angeles";

// ---------------------------------------------------------------- finalLabel

test("finalLabel: overtime reads Final/OT and Final/2OT, everything else is the league's usual word", () => {
  assert.equal(finalLabel("nba", "Final/OT"), "Final/OT");
  assert.equal(finalLabel("nba", "Final/2OT"), "Final/2OT");
  assert.equal(finalLabel("nfl", "Final/OT"), "Final/OT");
  assert.equal(finalLabel("nba", "Final"), "Final");
  assert.equal(finalLabel("nba", null), "Final");
  assert.equal(finalLabel("nba", "Final/OTX"), "Final");
  assert.equal(finalLabel("nba", "Postponed"), "Final");
  // football and cricket keep their own words
  assert.equal(finalLabel("epl", "FT"), "FT");
  assert.equal(finalLabel("ipl", "Final"), "Result");
  assert.equal(overtimeFinal("Final/3OT"), "Final/3OT");
  assert.equal(overtimeFinal("Final"), null);
});

test("finishedPillLabel: round and overtime combine; play-in and the Cup final show where a round would", () => {
  const base = { round: null as string | null, stage: "regular", competition_type: "STD", status_detail: "Final" as string | null };
  assert.equal(finishedPillLabel("nba", base), "Final");
  assert.equal(finishedPillLabel("nba", { ...base, status_detail: "Final/OT" }), "Final/OT");
  assert.equal(finishedPillLabel("nba", { ...base, round: "Second Round" }), "Second Round");
  assert.equal(finishedPillLabel("nba", { ...base, round: "Second Round", status_detail: "Final/2OT" }), "Second Round · Final/2OT");
  assert.equal(finishedPillLabel("nba", { ...base, stage: "playin" }), "Play-In");
  assert.equal(finishedPillLabel("nba", { ...base, stage: "playin", status_detail: "Final/OT" }), "Play-In · Final/OT");
  assert.equal(finishedPillLabel("nba", { ...base, stage: "excluded", competition_type: "CC" }), "NBA Cup final");
  assert.equal(finishedPillLabel("nba", base, "final"), "final");
  // a stored round is never replaced by the play-in label, and `round` itself is not what supplies it
  assert.equal(gameRoundLabel({ round: "Semi Final", stage: "playin" }), "Semi-Final");
  assert.equal(gameRoundLabel({ round: null, stage: "playin" }), "Play-In");
  assert.equal(gameRoundLabel({ round: null, stage: "regular" }), null);
});

// ---------------------------------------------------------------- isTimeTbd

test("isTimeTbd: only a fixture whose status says TBD", () => {
  const g = (over: Record<string, unknown> = {}) => ({ completed: false, status_state: "pre" as string | null, status_detail: "1/10 - TBD" as string | null, ...over });
  assert.equal(isTimeTbd(g()), true);
  assert.equal(isTimeTbd(g({ status_detail: "tbd" })), true);
  assert.equal(isTimeTbd(g({ status_detail: "Scheduled" })), false);
  assert.equal(isTimeTbd(g({ status_detail: null })), false);
  assert.equal(isTimeTbd(g({ status_detail: "TBDX" })), false);
  assert.equal(isTimeTbd(g({ status_state: "in" })), false);
  assert.equal(isTimeTbd(g({ status_state: "post", completed: true })), false);
  assert.equal(isTimeTbd(g({ status_detail: "Postponed - TBD" })), false);
});

// ---------------------------------------------------------------- formatMinute

test("formatMinute: stoppage form, half-time substitution, plain minutes, idempotent", () => {
  assert.equal(formatMinute("90'+4'"), "90+4'");
  assert.equal(formatMinute("45'+2'"), "45+2'");
  assert.equal(formatMinute("67'"), "67'");
  assert.equal(formatMinute("45'", { period: 2 }), "46'");
  assert.equal(formatMinute("45'", { period: 2, value: 2700 }), "46'");
  // a period-1 45th minute and a period-2 clock that is not exactly 2700 seconds are left as they are
  assert.equal(formatMinute("45'", { period: 1 }), "45'");
  assert.equal(formatMinute("45'", { period: 2, value: 2640 }), "45'");
  assert.equal(formatMinute("46'", { period: 2 }), "46'");
  assert.equal(formatMinute("Pen. missed"), "Pen. missed");
  assert.equal(formatMinute("12:34"), "12:34");
  assert.equal(formatMinute(""), "");
  for (const s of ["90'+4'", "45'", "67'", "Pen. missed"]) assert.equal(formatMinute(formatMinute(s, { period: 2 }), { period: 2 }), formatMinute(s, { period: 2 }));
});

test("presentDetails: converts events and line-up minutes, and accepts raw and already converted values", () => {
  const ev = (clock: string, period: number) => ({ period, clock, type: "sub" as const, team_id: null, players: [], text: "", home_score: null, away_score: null });
  const details = {
    events: [ev("90'+4'", 2), ev("45'", 2), ev("30'", 1), ev("45'", 1)],
    lineups: [{ team_id: "1", formation: null, starters: [{ id: "1", name: "A", jersey: null, position: null, place: 1, minute: "90'+1'", in_for: null }], subs: [] }],
  } as unknown as GameDetails;
  const once = presentDetails(details);
  assert.deepEqual(once.events.map((e) => e.clock), ["90+4'", "46'", "30'", "45'"]);
  assert.equal(once.lineups[0].starters[0].minute, "90+1'");
  assert.deepEqual(presentDetails(once), once);
  // the stored value is not mutated
  assert.equal(details.events[0].clock, "90'+4'");
});

// ---------------------------------------------------------------- joinTeams

test("joinTeams: teams in the order given, separated by a slash", () => {
  assert.equal(joinTeams([{ name: "Chicago Bulls" }]), "Chicago Bulls");
  assert.equal(joinTeams([{ name: "Chicago Bulls" }, { name: "Cleveland Cavaliers" }]), "Chicago Bulls / Cleveland Cavaliers");
  assert.equal(joinTeams([{ name: "A" }, { name: "B" }, { name: "C" }]), "A / B / C");
  assert.equal(joinTeams([]), "");
});

// ---------------------------------------------------------------- LocalTime

test("formatLocalTime: soccer is 24-hour with a short zone name; US leagues keep the 12-hour clock", () => {
  const iso = "2026-09-20T14:30:00.000Z";
  assert.equal(formatLocalTime(iso, "time", { clock24: true, timeZone: "UTC" }), "14:30 UTC");
  assert.equal(formatLocalTime(iso, "time", { clock24: true, timeZone: "Europe/London" }), "15:30 BST");
  assert.equal(formatLocalTime("2026-09-21T00:20:00.000Z", "time", { clock24: true, timeZone: "UTC" }), "00:20 UTC");
  assert.equal(formatLocalTime(iso, "datetime", { clock24: true, timeZone: "UTC" }), "Sun, Sep 20 · 14:30 UTC");
  assert.equal(formatLocalTime(iso, "date", { clock24: true, timeZone: "UTC" }), "Sun, Sep 20");
  assert.equal(formatLocalTime(iso, "time", { timeZone: "America/New_York" }), "10:30 AM");
  assert.equal(formatLocalTime(iso, "datetime", { timeZone: "America/New_York" }), "Sun, Sep 20 · 10:30 AM");
});

test("LocalTime server first paint: soccer says UTC explicitly, whatever the server's zone", () => {
  const html = renderToStaticMarkup(createElement(LocalTime, { iso: "2026-09-20T14:30:00.000Z", format: "time", league: "epl" }));
  assert.match(html, />14:30 UTC</);
  const nfl = renderToStaticMarkup(createElement(LocalTime, { iso: "2026-09-21T00:20:00.000Z", format: "datetime", league: "nfl" }));
  assert.match(nfl, /Sun, Sep 20 · 8:20 PM/);
});

// ---------------------------------------------------------------- gameDisplay

const g = (over: Record<string, unknown> = {}) => ({
  date: "2026-09-20T12:00:00.000Z",
  completed: true,
  status_state: "post" as string | null,
  status_detail: "Final" as string | null,
  round: null as string | null,
  stage: "regular" as GameRow["stage"],
  competition_type: "STD" as string | null,
  status_summary: null as string | null,
  home_name: "Arsenal",
  away_name: "Chelsea",
  home_score: 2,
  away_score: 1,
  home_score_display: null as string | null,
  away_score_display: null as string | null,
  ...over,
});

test("scoreboardTileStatus and gameAccessibleLabel: overtime, stage, play-in and Cup final", () => {
  assert.equal(scoreboardTileStatus("nba", g(), false), "Final");
  assert.equal(scoreboardTileStatus("nba", g({ status_detail: "Final/OT" }), false), "Final/OT");
  assert.equal(scoreboardTileStatus("nba", g({ status_detail: "Final/2OT" }), false), "Final/2OT");
  assert.equal(scoreboardTileStatus("nba", g({ round: "Second Round", status_detail: "Final/OT" }), false), "Second Round · Final/OT");
  assert.equal(scoreboardTileStatus("nba", g({ stage: "playin" }), false), "Play-In");
  assert.equal(scoreboardTileStatus("nba", g({ competition_type: "CC", stage: "excluded" }), false), "NBA Cup final");
  assert.equal(scoreboardTileStatus("nba", g({ status_detail: "Final/OT" }), true), "Sep 20, 2026 · Final/OT");
  assert.match(gameAccessibleLabel("nba", g({ status_detail: "Final/OT" })), /, Final\/OT$/);
  assert.match(gameAccessibleLabel("nfl", g({ status_detail: "Final/OT" })), /, Final\/OT$/);
  assert.match(gameAccessibleLabel("nba", g()), /, final$/);
  assert.match(gameAccessibleLabel("nba", g({ stage: "playin" })), /, Play-In$/);
  assert.equal(shareImageStatus(g({ status_detail: "Final/2OT", status_summary: null })), "Final/2OT");
  assert.equal(shareImageStatus(g({ status_summary: null })), "Final");
});

test("gameAccessibleLabel: football names the home side first, the US leagues the visitors", () => {
  assert.equal(gameAccessibleLabel("epl", g({ status_detail: "FT" })), "Arsenal 2, Chelsea 1, final");
  assert.equal(gameAccessibleLabel("nba", g()), "Chelsea 1, Arsenal 2, final");
  assert.equal(gameAccessibleLabel("nfl", g()), "Chelsea 1, Arsenal 2, final");
  const upcoming = g({ completed: false, status_state: "pre", status_detail: "Scheduled" });
  assert.equal(gameAccessibleLabel("epl", upcoming), "Arsenal v Chelsea, Sunday, September 20");
  assert.equal(gameAccessibleLabel("nba", upcoming), "Chelsea at Arsenal, Sunday, September 20");
  assert.equal(scoreLineHomeFirst("epl"), true);
  assert.equal(scoreLineHomeFirst("nba"), false);
  assert.equal(scoreLineHomeFirst("ipl"), false);
});

test("a to-be-determined kickoff shows the day and TBD, never a clock time", () => {
  const tbd = g({ completed: false, status_state: "pre", status_detail: "1/10 - TBD", date: "2027-01-10T05:00:00.000Z" });
  assert.equal(scheduleRowHeading("nfl", tbd), "Sun, Jan 10 · TBD");
  assert.equal(scoreboardTileStatus("nfl", tbd, false), "TBD");
  assert.equal(scoreboardTileStatus("nfl", tbd, true), "Jan 10, 2027 · Upcoming");
  assert.doesNotMatch(scoreboardTileStatus("nfl", tbd, false), /\d:\d\d/);
  // a fixture with a real time is unchanged
  assert.equal(scheduleRowHeading("nfl", g({ completed: false, status_state: "pre", status_detail: "Scheduled", date: "2026-09-21T00:20:00.000Z" })), "Sun, Sep 20 · 8:20 PM ET");
});

// ---------------------------------------------------------------- components

const pill = (props: Record<string, unknown>) => renderToStaticMarkup(createElement(StatusPill, { date: "2026-09-20T14:30:00.000Z", statusState: "post", statusDetail: "Final", completed: true, ...props } as never));

test("StatusPill: Final/OT, stage plus overtime, play-in, Cup final", () => {
  assert.match(pill({ league: "nba", statusDetail: "Final/2OT" }), />Final\/2OT</);
  assert.match(pill({ league: "nfl", statusDetail: "Final/OT" }), />Final\/OT</);
  assert.match(pill({ league: "nba" }), />Final</);
  assert.match(pill({ league: "nba", statusDetail: "Final/OT", round: "Second Round" }), />Second Round · Final\/OT</);
  assert.match(pill({ league: "nba", stage: "playin", statusDetail: "Final/OT" }), />Play-In · Final\/OT</);
  assert.match(pill({ league: "nba", competitionType: "CC" }), />NBA Cup final</);
  assert.match(pill({ league: "epl", statusDetail: "FT" }), />FT</);
});

test("StatusPill: an upcoming match shows its kickoff time when asked, and a TBD kickoff shows TBD", () => {
  const up = { statusState: "pre", statusDetail: "Scheduled", completed: false };
  assert.match(pill({ ...up, league: "epl", kickoff: "datetime" }), /Sun, Sep 20 · 14:30 UTC/);
  assert.doesNotMatch(pill({ ...up, league: "epl" }), /· 14:30/);
  const tbd = pill({ ...up, league: "nfl", statusDetail: "1/10 - TBD", date: "2027-01-10T05:00:00.000Z", kickoff: "datetime" });
  assert.match(tbd, /Sun, Jan 10 · TBD/);
  assert.doesNotMatch(tbd, /12:00 AM|\d:\d\d/);
});

const row = (over: Partial<GameRow> = {}): GameRow => ({
  league: "epl", espn_id: "1", date: "2026-09-20T14:30:00.000Z", name: "n", short_name: null, home_score: 5, away_score: 3, home_score_display: null, away_score_display: null,
  home_winner: true, away_winner: false, season_year: 2026, status_state: "post", status_detail: "FT", status_summary: null, round: null, stage: "regular", completed: true,
  home_team_espn_id: "h", away_team_espn_id: "a", home_name: "Manchester City", home_slug: "man-city", home_abbr: "MCI", home_logo: null, home_color: null,
  away_name: "Sunderland", away_slug: "sunderland", away_abbr: "SUN", away_logo: null, away_color: null, ...over,
});
const order = (html: string, a: string, b: string) => html.indexOf(a) < html.indexOf(b);

test("GameCard: football lists the home team first; NBA and NFL the visitors; cricket as before", () => {
  const epl = renderToStaticMarkup(createElement(GameCard, { league: "epl", game: row() }));
  assert.ok(order(epl, "Manchester City", "Sunderland"), "epl: home first");
  const nba = renderToStaticMarkup(createElement(GameCard, { league: "nba", game: row({ league: "nba" }) }));
  assert.ok(order(nba, "Sunderland", "Manchester City"), "nba: visitors first");
  const nfl = renderToStaticMarkup(createElement(GameCard, { league: "nfl", game: row({ league: "nfl" }) }));
  assert.ok(order(nfl, "Sunderland", "Manchester City"), "nfl: visitors first");
  const ipl = renderToStaticMarkup(createElement(GameCard, { league: "ipl", game: row({ league: "ipl", status_detail: "Final" }) }));
  assert.ok(order(ipl, "Sunderland", "Manchester City"), "ipl unchanged: away listed first");
});

test("GameCard: an NFL game with no kickoff time says TBD, and Final/OT shows on the card", () => {
  const tbd = renderToStaticMarkup(createElement(GameCard, { league: "nfl", game: row({ league: "nfl", completed: false, status_state: "pre", status_detail: "1/10 - TBD", date: "2027-01-10T05:00:00.000Z" }) }));
  assert.match(tbd, /TBD/);
  assert.doesNotMatch(tbd, /12:00 AM/);
  assert.match(tbd, /Jan 10/);
  const ot = renderToStaticMarkup(createElement(GameCard, { league: "nba", game: row({ league: "nba", status_detail: "Final/2OT" }) }));
  assert.match(ot, />Final\/2OT</);
});
