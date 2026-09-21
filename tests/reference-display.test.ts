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
import { MatchHeader } from "../src/components/MatchHeader";
import { MatchScoreHeader } from "../src/components/MatchScoreHeader";
import { TeamStatsComparison } from "../src/components/TeamStatsComparison";
import { TeamStatsExportCard } from "../src/components/TeamStatsExportCard";
import { MatchContextCard } from "../src/components/MatchContextCard";
import { MatchFacts } from "../src/components/MatchFacts";
import { UpcomingProbabilityExportCard } from "../src/components/ProjectionsExportCards";
import { matchContextView } from "../src/lib/gamePage";
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
  // one rule for the timeline and the line-ups: any clock value inside the interval minute reads 46'
  assert.equal(formatMinute("45'", { period: 2, value: 2701 }), "46'");
  assert.equal(formatMinute("45'", { period: 2, value: 2759 }), "46'");
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
  assert.match(gameAccessibleLabel("nba", g({ stage: "playin" })), /, Play-In, final$/);
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
// The order the names appear in the card's visible team rows. The full names sit in a `hidden sm:inline` span in each
// row; the aria-label on the link, the crest alt text and any other mention are not rows, so they cannot decide this.
const visibleRows = (html: string) => [...html.matchAll(/<span class="hidden sm:inline">([^<]*)<\/span>/g)].map((m) => m[1]);
const order = (html: string, a: string, b: string) => {
  const rows = visibleRows(html);
  assert.deepEqual([...rows].sort(), [a, b].sort(), "the card has exactly the two team rows");
  return rows.indexOf(a) < rows.indexOf(b);
};

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

// ------------------------------------------------------------ fix round 1

test("presentDetails: a half-time substitution reads the same in the timeline and the line-up, whatever its clock value", () => {
  const sub = (id: string, off: string, clock: string, period: number) => ({ period, clock, type: "sub" as const, team_id: "1", players: [{ id, name: `P${id}` }, { id: off, name: `P${off}` }], text: "", home_score: null, away_score: null });
  const player = (id: string, minute: string | null) => ({ id, name: `P${id}`, jersey: null, position: null, place: 1, minute, in_for: null });
  // stored as ESPN gave it: two substitutes came on at the interval ("45'" at 2700 and at 2701), one late (stoppage), one early (period 1)
  const stored = {
    events: [sub("10", "1", "45'", 2), sub("11", "2", "45'", 2), sub("12", "3", "90'+2'", 2), sub("13", "4", "45'", 1)],
    lineups: [{
      team_id: "1", formation: null,
      starters: [player("1", "45'"), player("2", "45'"), player("3", "90'+2'"), player("4", "45'")],
      subs: [player("10", "45'"), player("11", "45'"), player("12", "90'+2'"), player("13", "45'"), player("99", "45'")],
    }],
  } as unknown as GameDetails;
  const out = presentDetails(stored);
  const timeline = new Map(out.events.map((e) => [e.players[0].id, e.clock]));
  for (const p of out.lineups[0].subs) if (timeline.has(p.id)) assert.equal(p.minute, timeline.get(p.id), `sub ${p.id} agrees with its timeline event`);
  assert.equal(timeline.get("10"), "46'");
  assert.equal(timeline.get("11"), "46'");
  assert.equal(timeline.get("12"), "90+2'");
  assert.equal(timeline.get("13"), "45'");
  // starters taken off match the same events by the player who went off
  assert.deepEqual(out.lineups[0].starters.map((p) => p.minute), ["46'", "46'", "90+2'", "45'"]);
  // no matching event: the plain conversion, and applying it again changes nothing
  assert.equal(out.lineups[0].subs.find((p) => p.id === "99")?.minute, "45'");
  assert.deepEqual(presentDetails(out), out);
});

test("StatusPill: a live game keeps its stage label and shows the clock after it; a card that prints the clock itself asks for the label only", () => {
  const live = { statusState: "in", statusDetail: "Q3 4:12", date: "2026-09-20T14:30:00.000Z", completed: false, league: "nba" };
  assert.match(renderToStaticMarkup(createElement(StatusPill, { ...live, stage: "playin" } as never)), /Play-In · Q3 4:12/);
  assert.match(renderToStaticMarkup(createElement(StatusPill, { ...live, competitionType: "CC" } as never)), /NBA Cup final · Q3 4:12/);
  assert.match(renderToStaticMarkup(createElement(StatusPill, { ...live, stage: "playin", clock: false } as never)), />Play-In</);
  assert.match(renderToStaticMarkup(createElement(StatusPill, live as never)), />Q3 4:12</);
});

test("MatchHeader: an upcoming match prints its date once, a finished one keeps the header date", () => {
  const upcoming = renderToStaticMarkup(createElement(MatchHeader, { league: "epl", game: row({ completed: false, status_state: "pre", status_detail: "Scheduled" }) }));
  assert.equal(upcoming.match(/Sep 20/g)?.length, 1, "date once");
  assert.match(upcoming, /Sun, Sep 20 · 14:30 UTC/);
  const done = renderToStaticMarkup(createElement(MatchHeader, { league: "epl", game: row() }));
  assert.match(done, /Sun, Sep 20, 2026/);
});

test("MatchHeader: a live Play-In game shows its clock", () => {
  const html = renderToStaticMarkup(createElement(MatchHeader, { league: "nba", game: row({ league: "nba", stage: "playin", completed: false, status_state: "in", status_detail: "Q3 4:12" }) }));
  assert.match(html, /Play-In · Q3 4:12/);
});

test("MatchScoreHeader (export cards): the finished word is the pill's word", () => {
  const head = (league: string, over: Partial<GameRow>) => renderToStaticMarkup(createElement(MatchScoreHeader, { league: league as never, game: row({ league: league as never, ...over }) }));
  assert.match(head("epl", {}), /FT · Sun, Sep 20, 2026/);
  assert.match(head("ipl", { status_detail: "Final" }), /Result · Sun/);
  assert.match(head("nba", { status_detail: "Final/2OT" }), /Final\/2OT · Sun/);
  assert.match(head("nba", { status_detail: "Final" }), /Final · Sun/);
  assert.match(head("nba", { stage: "playin", status_detail: "Final/OT" }), /Play-In · Final\/OT · Sun/);
  assert.match(head("nba", { stage: "excluded", competition_type: "CC" }), /NBA Cup final · Sun/);
  assert.match(head("nba", { round: "Second Round" }), /Second Round · Sun/);
});

const stats = (name: string, id: string, values: string[]) => ({ teamId: id, teamName: name, stats: values.map((v, i) => ({ label: ["Shots", "Fouls"][i], value: v })) });
const away = stats("Sunderland", "a", ["4", "9"]);
const home = stats("Manchester City", "h", ["20", "6"]);
const textOrder = (html: string, a: string, b: string) => html.indexOf(a) < html.indexOf(b);

test("TeamStatsComparison: football home team on the left, NBA/NFL visitors on the left, each side keeps its colour", () => {
  const foot = renderToStaticMarkup(createElement(TeamStatsComparison, { away, home, homeFirst: true }));
  assert.ok(textOrder(foot, ">Manchester City<", ">Sunderland<"));
  assert.ok(textOrder(foot, ">20<", ">4<"), "home shots value first");
  const bar = foot.match(/<span class="h-full ([^"]*)" style="width:([\d.]+)%"/);
  assert.ok(bar);
  assert.equal(bar[1], "bg-[var(--accent)]", "the left segment is the home team's colour");
  assert.equal(Number(bar[2]).toFixed(1), "83.3", "and 20 of 24 shots wide");
  const us = renderToStaticMarkup(createElement(TeamStatsComparison, { away, home }));
  assert.ok(textOrder(us, ">Sunderland<", ">Manchester City<"));
  assert.ok(textOrder(us, ">4<", ">20<"));
  assert.match(us, /<span class="h-full bg-\[var\(--accent-2\)\]" style="width:16\.6/);
});

test("TeamStatsExportCard: football lists the home team first in the legend, bars and context", () => {
  const html = (league: string) => renderToStaticMarkup(createElement(TeamStatsExportCard, { league: league as never, game: row({ league: league as never }), away, home, title: "Team stats" }));
  const epl = html("epl");
  assert.ok(textOrder(epl.slice(epl.indexOf("Team stats")), "Manchester City", "Sunderland"));
  assert.ok(textOrder(epl.slice(epl.indexOf("Team stats")), ">20<", ">4<"));
  const nba = html("nba");
  assert.ok(textOrder(nba.slice(nba.indexOf("Team stats")), "Sunderland", "Manchester City"));
});

test("MatchContextCard: football lists home first in the probability line and every column", () => {
  const side = (elo: number) => ({ elo, eloAfter: null, form: [] as ("W" | "D" | "L")[], position: null, record: null });
  const context = { home: side(1800), away: side(1500), probabilities: { homeWin: 0.7, draw: 0.2, awayWin: 0.1 }, tableSize: null, week: null, weekGames: [] };
  const render = (league: string) => {
    const g = row({ league: league as never, completed: false, status_state: "pre" });
    return renderToStaticMarkup(createElement(MatchContextCard, { league: league as never, game: g, context, view: matchContextView(league as never, g) }));
  };
  const epl = render("epl");
  assert.ok(textOrder(epl, "MCI 70%", "10% SUN"), "probability line: home first");
  assert.ok(textOrder(epl, ">1800<", ">1500<"), "Elo column: home first");
  const nba = render("nba");
  assert.ok(textOrder(nba, "SUN 10%", "70% MCI"), "NBA: visitors first");
  assert.ok(textOrder(nba, ">1500<", ">1800<"));
});

test("MatchFacts: score by period lists football's home side first", () => {
  const details = { venue: null, city: null, attendance: null, officials: [], linescores: { home: ["2", "3"], away: ["1", "2"] } } as unknown as GameDetails;
  const render = (league: string) => renderToStaticMarkup(createElement(MatchFacts, { league: league as never, game: row({ league: league as never }), details }));
  assert.ok(textOrder(render("epl"), ">MCI<", ">SUN<"));
  assert.ok(textOrder(render("nba"), ">SUN<", ">MCI<"));
});

test("UpcomingProbabilityExportCard: football reads home v away with the home probability first; NBA stays visitors at home", () => {
  const proj = (league: string) => ({ season: 2026, upcoming: [{ game: row({ league: league as never, completed: false, status_state: "pre" }), homeWin: 0.7, draw: 0.2, awayWin: 0.1 }] }) as never;
  const render = (league: string) => renderToStaticMarkup(createElement(UpcomingProbabilityExportCard, { league: league as never, proj: proj(league), title: "t" }));
  const epl = render("epl");
  assert.ok(textOrder(epl, "MCI", "SUN"), "home team first");
  assert.ok(textOrder(epl, "70%", "10%"), "home probability first");
  assert.match(epl, />v</);
  const nba = render("nba");
  assert.ok(textOrder(nba, "SUN", "MCI"));
  assert.ok(textOrder(nba, "10%", "70%"));
  assert.match(nba, />at</);
});

test("gameAccessibleLabel: 'final' follows a stage label unless the label already ends in it", () => {
  const name = (over: Record<string, unknown>) => gameAccessibleLabel("epl", g(over));
  assert.equal(name({ round: "Final" }), "Arsenal 2, Chelsea 1, Final");
  assert.equal(name({ round: "Semi Final" }), "Arsenal 2, Chelsea 1, Semi-Final");
  assert.equal(name({ round: "Quarter-Final" }), "Arsenal 2, Chelsea 1, Quarter-Final");
  assert.equal(name({ round: "Round of 16" }), "Arsenal 2, Chelsea 1, Round of 16, final");
  assert.equal(gameAccessibleLabel("nba", g({ stage: "excluded", competition_type: "CC" })), "Chelsea 1, Arsenal 2, NBA Cup final");
  assert.equal(gameAccessibleLabel("nba", g({ note: "NBA Cup - Group Play" })), "Chelsea 1, Arsenal 2, NBA Cup · Group play, final");
  assert.equal(gameAccessibleLabel("nba", g({ stage: "playin" })), "Chelsea 1, Arsenal 2, Play-In, final");
  assert.equal(gameAccessibleLabel("nba", g({ status_detail: "Final/2OT" })), "Chelsea 1, Arsenal 2, Final/2OT");
  assert.equal(gameAccessibleLabel("nba", g({ stage: "playin", status_detail: "Final/OT" })), "Chelsea 1, Arsenal 2, Play-In · Final/OT");
  assert.equal(gameAccessibleLabel("nba", g()), "Chelsea 1, Arsenal 2, final");
});
