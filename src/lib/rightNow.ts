// The "Right now" card on the first-visit homepage: which single match to feature, and the figures the card
// prints. Pure (no database, no network), so a test can feed it rows and read the choice back.
//
// The rule, in order, stated on the card itself as `why`:
//   1. A limited-overs cricket chase in progress (the side batting second has a target to reach): the one with
//      the fewest balls left; a tie keeps the order `getHomeData` already gives (headline competitions first,
//      then internationals; only headline cricket reaches the homepage at all).
//   2. Else the closest score among the other games in play (smallest gap; a tie goes to the earlier start).
//   3. Else a cricket match in play that is not a chase (first innings, a Test): ESPN's own status line.
//   4. Else, with nothing in play: "Next up" when something starts within 24 hours, "Latest result" when a game
//      finished within the last 48 hours, else whichever of the two exists, else an honest empty state.
// Nothing here is invented: every figure is read from the score text and status line the match page itself shows.
import type { GameRow } from "./queries";
import type { CricketSeriesMatch, SeriesSide } from "./cricketSeriesTypes";
import type { HomeData } from "./homeData";
import type { StoryInnings } from "./cricketBalls";
import { matchStoryModel } from "./cricketMatchStoryModel";
import { isCricketLeague, LEAGUE_LABEL, type League } from "./leagues";
import { scoreLineSides } from "./gamePage";
import { isUpcomingGame, sideScoreText, splitScoreText } from "./gameDisplay";
import { gameRoundLabel, normalizeStage } from "./stage";
import { teamDisplayName } from "./teamName";

export interface RightNowSide {
  name: string;
  logo: string | null;
  /** ESPN's team colour (bare hex) for the card's edge, when the row carries one. */
  color: string | null;
  /** The figure: "168/4", "2", "233 all out". Empty before a ball is bowled or a kickoff. */
  main: string;
  /** The small print under the name: "16.2/20 ov, target 202". */
  detail: string | null;
  /** The side that has finished its innings or is behind in a chase; drawn quieter. */
  dim: boolean;
}

export interface ChaseFigures {
  target: number;
  runs: number;
  need: number;
  ballsLeft: number;
  wicketsLeft: number;
  requiredRate: number;
  /** Runs per over so far; null when overs bowled are unknown. */
  currentRate: number | null;
  /** Share of the target already scored, 0 to 1: the ring. */
  fraction: number;
  /** Overs bowled as cricket writes them ("16.2"), when the score text gives them. */
  oversText: string | null;
}

export type RightNowRule = "chase" | "closest" | "cricket" | "next" | "latest" | "none";

export interface RightNowPick {
  rule: RightNowRule;
  /** The one-line reason this match is the one shown. */
  why: string;
  /** "live" only for a match in play; "next" and "latest" are labelled as such. */
  mode: "live" | "next" | "latest" | "none";
  /** "Sample T20 Cup · Final". */
  competition: string;
  href: string;
  sides: [RightNowSide, RightNowSide];
  /** The status line under the figures: ESPN's sentence, the clock, or the result. */
  line: string | null;
  chase: ChaseFigures | null;
  /** The pill's words for the innings or the clock: "2nd innings", "Q3 4:12". */
  stateLabel: string | null;
  /** ISO instant of the start, for "Next up". */
  startIso: string | null;
  /** League key for the kickoff clock of a league game; null for a series match. */
  league: League | null;
  /** The ESPN event and series ids the ball-by-ball is read with (a chase only). */
  story: { eventId: string; seriesId: string } | null;
  /** Index of the chasing side in `sides`, a chase only. */
  chasingIndex: 0 | 1 | null;
}

/* ---------------- score text ---------------- */

export interface ParsedScore {
  runs: number;
  /** Wickets down. ESPN writes an innings that ended all out as the bare total ("114 (18/20 ov, target 176)"), so no wickets is 10. */
  wickets: number;
  /** Legal balls bowled, from "16.2". */
  balls: number | null;
  /** The innings' overs, "16.2" as written. */
  oversText: string | null;
  limit: number | null;
  target: number | null;
}

/** Overs as cricket writes them to balls: 16.2 is 98. */
export function oversToBalls(overs: string): number | null {
  const m = /^(\d+)(?:\.([0-5]))?$/.exec(overs.trim());
  if (!m) return null;
  return Number(m[1]) * 6 + Number(m[2] ?? 0);
}

/**
 * ESPN's score text for one side: "168/4 (16.2/20 ov, target 202)", "201/6 (20 ov)", "233 all out",
 * "171 (19.1 ov)". The last innings of a multi-innings match ("311 & 372/6 (117 ov)") is read; a text with no
 * leading figure is null.
 */
export function parseCricketScore(text: string | null | undefined): ParsedScore | null {
  if (!text) return null;
  const last = text.split("&").pop()!.trim();
  const { main, detail } = splitScoreText(last);
  const m = /^(\d+)(?:\/(\d+))?(?:\s+(all out))?\s*(d)?$/i.exec(main.trim());
  if (!m) return null;
  const runs = Number(m[1]);
  const wickets = m[2] !== undefined ? Number(m[2]) : 10;
  let balls: number | null = null;
  let oversText: string | null = null;
  let limit: number | null = null;
  let target: number | null = null;
  if (detail) {
    const o = /(\d+(?:\.\d)?)(?:\/(\d+))?\s*ov/i.exec(detail);
    if (o) {
      oversText = o[1];
      balls = oversToBalls(o[1]);
      limit = o[2] ? Number(o[2]) : null;
    }
    const t = /target\s+(\d+)/i.exec(detail);
    if (t) target = Number(t[1]);
  }
  return { runs, wickets, balls, oversText, limit, target };
}

/** ESPN's chase sentence, "India need 52 runs from 30 balls": the runs and the balls. */
export function parseNeedText(text: string | null | undefined): { need: number; balls: number } | null {
  if (!text) return null;
  const m = /need\s+(\d+)\s+runs?\s+(?:from|in|off)\s+(\d+)\s+balls?/i.exec(text);
  return m ? { need: Number(m[1]), balls: Number(m[2]) } : null;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * The chase figures from the chasing side's score text and ESPN's status sentence. A chase needs a target the
 * side has not reached and balls left. Runs needed and balls left come from the score text (target minus runs,
 * the innings' limit minus balls bowled); when the status sentence gives them too and the two disagree, nothing is
 * claimed (the card then falls back to ESPN's sentence), so a figure on the card is one the match page shows
 * twice over.
 */
export function chaseFigures(score: string | null | undefined, status: string | null | undefined): ChaseFigures | null {
  const p = parseCricketScore(score);
  if (!p || p.target === null) return null;
  // All out: the innings is over, whatever the target.
  if (p.wickets >= 10) return null;
  const said = parseNeedText(status);
  const needFromScore = p.target - p.runs;
  const ballsFromScore = p.limit !== null && p.balls !== null ? p.limit * 6 - p.balls : null;
  if (said && said.need !== needFromScore) return null;
  if (said && ballsFromScore !== null && said.balls !== ballsFromScore) return null;
  const need = said ? said.need : needFromScore;
  const ballsLeft = said ? said.balls : ballsFromScore;
  if (need <= 0 || ballsLeft === null || ballsLeft <= 0) return null;
  return {
    target: p.target,
    runs: p.runs,
    need,
    ballsLeft,
    wicketsLeft: 10 - p.wickets,
    requiredRate: r2((need * 6) / ballsLeft),
    currentRate: p.balls ? r2((p.runs * 6) / p.balls) : null,
    fraction: Math.min(1, p.runs / p.target),
    oversText: p.oversText,
  };
}

/** "34 off 22": the open loop the ring prints. */
export function needLine(c: Pick<ChaseFigures, "need" | "ballsLeft">): string {
  return `${c.need} off ${c.ballsLeft}`;
}

/* ---------------- candidates ---------------- */

const toMs = (d: string | Date) => new Date(d).getTime();

/** "168/4 (16.2/20 ov, target 202)" as the figure and the small print; "171 all out (19.1 ov)" as 171 over "all out, 19.1 ov". */
function splitFigure(text: string | null | undefined, cricket = false): { main: string; detail: string | null } {
  if (!text) return { main: "", detail: null };
  const { main, detail } = splitScoreText(text);
  // Cricket's bare total is an innings that ended all out; say so.
  if (cricket && /^\d+$/.test(main)) return { main, detail: detail ? `all out, ${detail}` : "all out" };
  const allOut = /^(\d+)\s+all out$/i.exec(main);
  if (allOut && detail && detail !== "all out") return { main: allOut[1], detail: `all out, ${detail}` };
  return { main, detail };
}

function seriesSide(s: SeriesSide | null, fallback: string): RightNowSide {
  const { main, detail } = splitFigure(s?.score, true);
  return { name: teamDisplayName(s?.name || fallback), logo: s?.logo ?? null, color: null, main, detail, dim: false };
}

function gameSide(league: League, g: GameRow, side: "home" | "away"): RightNowSide {
  const score = side === "home" ? g.home_score : g.away_score;
  const display = side === "home" ? g.home_score_display : g.away_score_display;
  const text = sideScoreText(league, score, display, g.completed) ?? (score !== null ? String(score) : null);
  const { main, detail } = splitFigure(text, isCricketLeague(league));
  return {
    name: teamDisplayName(side === "home" ? g.home_name : g.away_name),
    logo: side === "home" ? g.home_logo : g.away_logo,
    color: side === "home" ? g.home_color : g.away_color,
    main,
    detail,
    dim: false,
  };
}

const gameHref = (g: GameRow) => `/${g.league}/games/${g.espn_id}`;
const seriesHref = (m: CricketSeriesMatch) => (m.scorecard_league ? `/${m.scorecard_league}/games/${m.espn_id}` : `/cricket/matches/${m.espn_id}`);

/** The competition line of a league game: "Premier League · Final"; of a series match: its series and stage. */
function gameCompetition(g: GameRow): string {
  return [LEAGUE_LABEL[g.league], gameRoundLabel(g)].filter(Boolean).join(" · ");
}
const seriesCompetition = (m: CricketSeriesMatch) => [m.series_name, normalizeStage(m.description)].filter(Boolean).join(" · ");

/** Both sides of a chase with the chasing side last (batting second), and which index it is. */
function chaseOrder(sides: [RightNowSide, RightNowSide], chasing: 0 | 1): { sides: [RightNowSide, RightNowSide]; chasingIndex: 0 | 1 } {
  const first = sides[chasing === 0 ? 1 : 0];
  const second = sides[chasing];
  return { sides: [{ ...first, dim: true }, { ...second, dim: false }], chasingIndex: 1 };
}

/** The side whose score text carries a target is the one batting second. */
function chasingSide(a: string | null | undefined, b: string | null | undefined): 0 | 1 | null {
  const ta = parseCricketScore(a)?.target ?? null;
  const tb = parseCricketScore(b)?.target ?? null;
  if (ta !== null && tb === null) return 0;
  if (tb !== null && ta === null) return 1;
  return null;
}

interface Candidate {
  pick: RightNowPick;
  ballsLeft: number;
  order: number;
}

function cricketLiveFromSeries(m: CricketSeriesMatch, order: number): Candidate {
  const rawSides: [RightNowSide, RightNowSide] = [seriesSide(m.home, "Home"), seriesSide(m.away, "Away")];
  const chasing = chasingSide(m.home?.score, m.away?.score);
  const status = m.status_summary ? teamDisplayName(m.status_summary) : null;
  const chase = chasing === null ? null : chaseFigures((chasing === 0 ? m.home : m.away)?.score, m.status_summary);
  const base = { href: seriesHref(m), competition: seriesCompetition(m), league: null, startIso: null } as const;
  if (chase && chasing !== null) {
    const o = chaseOrder(rawSides, chasing);
    return {
      ballsLeft: chase.ballsLeft,
      order,
      pick: { ...base, rule: "chase", mode: "live", why: "A chase in progress", sides: o.sides, line: status, chase, stateLabel: "2nd innings", story: { eventId: m.espn_id, seriesId: m.series_espn_id }, chasingIndex: o.chasingIndex },
    };
  }
  return {
    ballsLeft: Number.POSITIVE_INFINITY,
    order,
    pick: { ...base, rule: "cricket", mode: "live", why: "Cricket in play", sides: rawSides, line: status, chase: null, stateLabel: null, story: null, chasingIndex: null },
  };
}

function cricketLiveFromGame(g: GameRow, order: number): Candidate {
  const league = g.league;
  const [first, second] = scoreLineSides(league, g);
  const rawSides: [RightNowSide, RightNowSide] = [gameSide(league, g, first), gameSide(league, g, second)];
  const status = teamDisplayName(g.status_summary ?? g.status_detail ?? null);
  const scoreOf = (side: "home" | "away") => sideScoreText(league, side === "home" ? g.home_score : g.away_score, side === "home" ? g.home_score_display : g.away_score_display, g.completed);
  const chasing = chasingSide(scoreOf(first), scoreOf(second));
  const chase = chasing === null ? null : chaseFigures(scoreOf(chasing === 0 ? first : second), g.status_summary ?? g.status_detail);
  const base = { href: gameHref(g), competition: gameCompetition(g), league, startIso: null } as const;
  if (chase && chasing !== null) {
    const o = chaseOrder(rawSides, chasing);
    return { ballsLeft: chase.ballsLeft, order, pick: { ...base, rule: "chase", mode: "live", why: "A chase in progress", sides: o.sides, line: status, chase, stateLabel: "2nd innings", story: { eventId: g.espn_id, seriesId: "8048" }, chasingIndex: o.chasingIndex } };
  }
  return { ballsLeft: Number.POSITIVE_INFINITY, order, pick: { ...base, rule: "cricket", mode: "live", why: "Cricket in play", sides: rawSides, line: status, chase: null, stateLabel: null, story: null, chasingIndex: null } };
}

function marginOf(g: GameRow): number {
  return g.home_score === null || g.away_score === null ? Number.POSITIVE_INFINITY : Math.abs(g.home_score - g.away_score);
}

function liveGamePick(g: GameRow): RightNowPick {
  const league = g.league;
  const [first, second] = scoreLineSides(league, g);
  const margin = marginOf(g);
  const why = margin === 0 ? "The closest score in play: level" : Number.isFinite(margin) ? `The closest score in play: ${margin} apart` : "In play now";
  return {
    rule: "closest",
    mode: "live",
    why,
    competition: gameCompetition(g),
    href: gameHref(g),
    sides: [gameSide(league, g, first), gameSide(league, g, second)],
    line: g.status_detail ? teamDisplayName(g.status_detail) : null,
    chase: null,
    stateLabel: g.status_detail ? teamDisplayName(g.status_detail) : null,
    startIso: null,
    league,
    story: null,
    chasingIndex: null,
  };
}

/** A fixture or a finished game, labelled as such. */
function restingGamePick(g: GameRow, mode: "next" | "latest"): RightNowPick {
  const league = g.league;
  const [first, second] = scoreLineSides(league, g);
  const sides: [RightNowSide, RightNowSide] = [gameSide(league, g, first), gameSide(league, g, second)];
  if (mode === "latest") {
    const winner = g.home_winner === true ? "home" : g.away_winner === true ? "away" : null;
    if (winner) sides.forEach((s, i) => (s.dim = (i === 0 ? first : second) !== winner));
  }
  return {
    rule: mode,
    mode,
    why: mode === "next" ? "Next up" : "Latest result",
    competition: gameCompetition(g),
    href: gameHref(g),
    sides,
    line: mode === "latest" && g.status_summary ? teamDisplayName(g.status_summary) : null,
    chase: null,
    stateLabel: null,
    startIso: new Date(g.date).toISOString(),
    league,
    story: null,
    chasingIndex: null,
  };
}

function nextSeriesPick(m: CricketSeriesMatch): RightNowPick {
  return {
    rule: "next",
    mode: "next",
    why: "Next up",
    competition: seriesCompetition(m),
    href: seriesHref(m),
    sides: [seriesSide(m.home, "Home"), seriesSide(m.away, "Away")],
    line: null,
    chase: null,
    stateLabel: null,
    startIso: new Date(m.date).toISOString(),
    league: null,
    story: null,
    chasingIndex: null,
  };
}

const NONE: RightNowPick = {
  rule: "none",
  mode: "none",
  why: "Nothing in play",
  competition: "",
  href: "#live",
  sides: [
    { name: "", logo: null, color: null, main: "", detail: null, dim: false },
    { name: "", logo: null, color: null, main: "", detail: null, dim: false },
  ],
  line: null,
  chase: null,
  stateLabel: null,
  startIso: null,
  league: null,
  story: null,
  chasingIndex: null,
};

const DAY = 86_400_000;

type Source = Pick<HomeData, "liveGames" | "liveCricket" | "upcomingGames" | "nextCricket" | "sections" | "featured">;

/** The one match the card shows, by the rule at the top of this file. */
export function pickRightNow(home: Source, now: number = Date.now()): RightNowPick {
  const cricketGames = home.liveGames.filter((g) => isCricketLeague(g.league));
  const otherGames = home.liveGames.filter((g) => !isCricketLeague(g.league));

  const cricket: Candidate[] = [...cricketGames.map((g, i) => cricketLiveFromGame(g, i)), ...home.liveCricket.map((m, i) => cricketLiveFromSeries(m, cricketGames.length + i))];
  const chases = cricket.filter((c) => c.pick.rule === "chase").sort((a, b) => a.ballsLeft - b.ballsLeft || a.order - b.order);
  if (chases.length > 0) return chases[0].pick;

  if (otherGames.length > 0) {
    const closest = [...otherGames].sort((a, b) => marginOf(a) - marginOf(b) || toMs(a.date) - toMs(b.date) || a.espn_id.localeCompare(b.espn_id))[0];
    return liveGamePick(closest);
  }
  if (cricket.length > 0) return [...cricket].sort((a, b) => a.order - b.order)[0].pick;

  // Nothing in play: the soonest fixture, or the latest finished game.
  const fixtures: { at: number; pick: () => RightNowPick }[] = [
    ...home.upcomingGames.filter((g) => isUpcomingGame(g)).map((g) => ({ at: toMs(g.date), pick: () => restingGamePick(g, "next") })),
    ...home.nextCricket.filter((m) => m.status_state === "pre").map((m) => ({ at: toMs(m.date), pick: () => nextSeriesPick(m) })),
  ]
    .filter((f) => f.at >= now - 3_600_000)
    .sort((a, b) => a.at - b.at);
  const finished = [...home.sections.flatMap((s) => s.games), ...home.featured]
    .filter((g) => g.completed && g.status_state === "post" && home.liveGames.every((l) => l.espn_id !== g.espn_id))
    .sort((a, b) => toMs(b.date) - toMs(a.date) || a.espn_id.localeCompare(b.espn_id));
  const next = fixtures[0];
  const last = finished[0];
  if (next && next.at - now <= DAY) return next.pick();
  if (last && now - toMs(last.date) <= 2 * DAY) return restingGamePick(last, "latest");
  if (next) return next.pick();
  if (last) return restingGamePick(last, "latest");
  return NONE;
}

/* ---------------- the match story, for the chart ---------------- */

export interface RightNowWorm {
  /** SVG viewBox of the plot area only, so the chart fills the card. */
  viewBox: string;
  lines: { teamId: string; period: number; points: string; chasing: boolean }[];
  /** Where the chasing worm ends, as percentages of the plot, for the pulsing dot. */
  dot: { left: number; top: number } | null;
}

/** The chart, the latest over and its number, from the match story the match page draws (nothing before there are two innings). */
export function storyView(story: StoryInnings[]): { worm: RightNowWorm | null; lastBalls: string[] | null; overNumber: number | null } {
  const last = story.at(-1);
  if (!last || story.length < 2) return { worm: null, lastBalls: null, overNumber: null };
  const model = matchStoryModel(story);
  const { x0, x1, y0, y1 } = model.plot;
  const chasing = model.worm.find((w) => w.period === last.period);
  const over = last.overs.at(-1);
  return {
    worm: {
      viewBox: `${x0} ${y0} ${x1 - x0} ${y1 - y0}`,
      lines: model.worm.map((w) => ({ teamId: w.teamId, period: w.period, points: w.points, chasing: w.period === last.period })),
      dot: chasing ? { left: Math.round(((chasing.end.x - x0) / (x1 - x0)) * 1000) / 10, top: Math.round(((Math.min(chasing.end.y, y1) - y0) / (y1 - y0)) * 1000) / 10 } : null,
    },
    lastBalls: over ? over.balls.map((b) => b.symbol) : null,
    overNumber: over?.number ?? null,
  };
}


export interface RightNowView {
  pick: RightNowPick;
  worm: RightNowWorm | null;
  /** The latest over's deliveries as the match story writes them ("1", "W", "4", "wd"). */
  lastBalls: string[] | null;
  /** The innings the story read for the chasing side; null when none matched. */
  overNumber: number | null;
}

