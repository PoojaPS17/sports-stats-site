/* eslint-disable @typescript-eslint/no-explicit-any -- ESPN feed JSON has no published schema */
// ESPN's cricket play-by-play, read into the shape the match page's story needs: innings, overs,
// one symbol per delivery, the fall of each wicket and the partnerships between them; and the
// fetcher that reads the pages with a cache window per page.
import { LIVE_REVALIDATE } from "./cricketLive";
import { baseSeriesId } from "./cricketSeriesKey";

/** A finished match's pages keep a day, the same as its render (see cricketMatchCache.ts FINISHED_MATCH_REVALIDATE; repeated here so this module imports no database code). */
const FINISHED_REVALIDATE = 86400;

export type BallExtra = "wd" | "nb" | "b" | "lb" | null;

export interface StoryBall {
  /** W, 4, 6, 0, wd, or the run count. */
  symbol: string;
  /** Runs the ball added to the total, extras included. */
  runs: number;
  wicket: boolean;
  extra: BallExtra;
}

export interface StoryOver {
  number: number;
  runs: number;
  wickets: number;
  balls: StoryBall[];
}

export interface StoryWicket {
  /** As cricket writes it: 4.3 is the third ball of the fifth over. */
  over: number;
  /** Team runs when it fell. */
  runs: number;
  wicket: number;
  batter: string;
  how: string;
  /** Null for a run out, which credits no bowler. */
  bowler: string | null;
  /** The catcher or stumper, when the feed names one. */
  fielder: string | null;
  /** The fielder was the wicketkeeper (a stumping, or a catch behind). */
  keeper: boolean;
  /** The batter's score when out, known when the batter out was the striker. */
  batterRuns: number | null;
  /** ESPN's own scorecard line for the wicket without its timing bracket: "SD Hope c Patel b Naman Dhir 52". The fallback when the fields above cannot write one. */
  text: string;
}

export interface StoryPartnership {
  wicket: number;
  runs: number;
  balls: number;
  batters: [string, string];
  unbroken: boolean;
}

export interface WormPoint {
  /** Overs as a decimal position: 1 after the first over, 14.67 after 14.4. */
  over: number;
  runs: number;
  wickets: number;
}

export interface StoryInnings {
  period: number;
  teamId: string;
  team: string;
  overs: StoryOver[];
  worm: WormPoint[];
  wickets: StoryWicket[];
  partnerships: StoryPartnership[];
  total: { runs: number; wickets: number; overs: number };
  runRate: number | null;
  requiredRunRate: number | null;
  target: number | null;
  /** The overs the innings may last (20, 50, a reduced number), from the feed; null when it does not say. */
  limit: number | null;
}

const name = (o: any): string => String(o?.athlete?.displayName ?? "");
const num = (v: unknown, fallback = 0): number => (typeof v === "number" && Number.isFinite(v) ? v : fallback);

/**
 * The over's number once it is complete, else how far into it the ball is by legal deliveries: 19.17
 * for 19.1. From `actual` (the scorecard's count), not `ball`, which numbers wides and no-balls too.
 */
function position(over: any): number {
  if (over?.complete) return num(over.number);
  const actual = num(over?.actual);
  return Math.round((Math.floor(actual) + Math.round((actual % 1) * 10) / 6) * 100) / 100;
}

/** ESPN's dismissal line without its timing bracket, entities decoded, spaces collapsed. */
function dismissalText(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.split(" (")[0].replace(/&amp;/g, "&").replace(/&dagger;/g, "\u2020").replace(/\s+/g, " ").trim();
}

function symbolOf(item: any): StoryBall {
  const runs = num(item.scoreValue);
  const type = String(item.playType?.description ?? "").toLowerCase();
  const wicket = item.dismissal?.dismissal === true;
  const extra: BallExtra = num(item.over?.noBall) > 0 ? "nb" : num(item.over?.wide) > 0 ? "wd" : type === "bye" ? "b" : type === "leg bye" ? "lb" : null;
  if (wicket) return { symbol: "W", runs, wicket, extra };
  if (type === "four") return { symbol: "4", runs, wicket, extra };
  if (type === "six") return { symbol: "6", runs, wicket, extra };
  if (extra === "wd") return { symbol: "wd", runs, wicket, extra };
  if (extra === "nb") return { symbol: String(Math.max(0, runs - 1)), runs, wicket, extra };
  return { symbol: String(runs), runs, wicket, extra };
}

const isBall = (item: any): boolean => item != null && typeof item === "object" && typeof item.period === "number" && item.over && typeof item.over === "object" && item.innings && typeof item.innings === "object";

/** The story of each innings from ESPN's play-by-play items, in sequence order. Items that are not balls are skipped. */
export function deriveMatchStory(items: unknown[]): StoryInnings[] {
  const balls = (items as any[]).filter(isBall).sort((a, b) => a.period - b.period || num(a.sequence) - num(b.sequence));
  const byPeriod = new Map<number, any[]>();
  for (const b of balls) byPeriod.set(b.period, [...(byPeriod.get(b.period) ?? []), b]);

  const out: StoryInnings[] = [];
  for (const [period, list] of [...byPeriod.entries()].sort((a, b) => a[0] - b[0])) {
    const overs: StoryOver[] = [];
    const worm: WormPoint[] = [];
    for (const item of list) {
      const n = num(item.over.number);
      let over = overs[overs.length - 1];
      if (!over || over.number !== n) {
        over = { number: n, runs: 0, wickets: 0, balls: [] };
        overs.push(over);
        worm.push({ over: 0, runs: 0, wickets: 0 });
      }
      over.balls.push(symbolOf(item));
      over.runs = num(item.over.runs, over.runs);
      over.wickets = num(item.over.wickets, over.wickets);
      // The over's worm point follows its last ball.
      worm[worm.length - 1] = { over: position(item.over), runs: num(item.innings.runs), wickets: num(item.innings.wickets) };
    }

    const wickets: StoryWicket[] = [];
    const partnerships: StoryPartnership[] = [];
    let fallRuns = 0;
    let fallBalls = 0;
    for (const item of list) {
      if (item.dismissal?.dismissal !== true) continue;
      const how = String(item.dismissal.type ?? "").toLowerCase();
      const runs = num(item.innings.runs);
      const ballsBowled = num(item.innings.balls);
      const batter = name(item.dismissal.batsman) || name(item.batsman);
      const strikerOut = batter === name(item.batsman);
      wickets.push({
        over: num(item.over.actual),
        runs,
        wicket: num(item.innings.wickets, wickets.length + 1),
        batter,
        how,
        bowler: how.includes("run out") ? null : name(item.dismissal.bowler) || null,
        fielder: name(item.dismissal.fielder) || null,
        keeper: item.dismissal.fielder?.isKeeper === true,
        batterRuns: strikerOut && typeof item.batsman?.totalRuns === "number" ? item.batsman.totalRuns : null,
        text: dismissalText(item.dismissal.text),
      });
      partnerships.push({ wicket: wickets.length, runs: runs - fallRuns, balls: ballsBowled - fallBalls, batters: [name(item.batsman), name(item.otherBatsman)], unbroken: false });
      fallRuns = runs;
      fallBalls = ballsBowled;
    }

    const last = list[list.length - 1];
    // A complete final over is a whole number (20, not ESPN's 19.6 for its sixth ball).
    const total = { runs: num(last.innings.runs), wickets: num(last.innings.wickets), overs: last.over.complete ? num(last.over.number) : num(last.over.actual) };
    if (total.wickets < 10 && last.dismissal?.dismissal !== true) {
      partnerships.push({ wicket: wickets.length + 1, runs: total.runs - fallRuns, balls: num(last.innings.balls) - fallBalls, batters: [name(last.batsman), name(last.otherBatsman)], unbroken: true });
    }
    out.push({
      period,
      teamId: String(last.team?.id ?? ""),
      team: String(last.team?.displayName ?? ""),
      overs,
      worm,
      wickets,
      partnerships,
      total,
      runRate: typeof last.innings.runRate === "number" ? last.innings.runRate : null,
      requiredRunRate: typeof last.innings.requiredRunRate === "number" ? last.innings.requiredRunRate : null,
      target: num(last.innings.target) > 0 ? num(last.innings.target) : null,
      limit: num(last.over.limit) > 0 ? num(last.over.limit) : null,
    });
  }
  return out;
}

/** Pages a render will read before giving up: an ODI is about 24 (25 balls a page); first-class matches are never asked. */
export const BALL_PAGE_CAP = 40;

export function playByPlayUrl(seriesId: string, eventId: string, page: number): string {
  return `https://site.web.api.espn.com/apis/site/v2/sports/cricket/${baseSeriesId(seriesId)}/playbyplay?event=${eventId}&page=${page}`;
}

export interface BallFetchOptions {
  /** The match is over on both the stored row and ESPN (see cricketMatchCache): every page keeps for a day. */
  settled: boolean;
  /** Injectable for tests; the default is Next's fetch with `next.revalidate`. */
  fetchJson?: (url: string, revalidate: number) => Promise<unknown>;
}

/** How long one page may take before the story is dropped for this render; the page must not wait on a slow ESPN. */
const PAGE_TIMEOUT_MS = 6000;

async function nextFetchJson(url: string, revalidate: number): Promise<unknown> {
  const res = await fetch(url, { next: { revalidate }, signal: AbortSignal.timeout(PAGE_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`${res.status} from ${url}`);
  return res.json();
}

/**
 * Every ball of a match, in page order. The feed is append-only, so a filled middle page never
 * changes and keeps for a day whatever the match state; the first page (which says how many pages
 * there are) and the last one (still filling while live) keep for the live window until the match
 * is settled. Null on any failure, an error body or a match past the page cap: the page renders
 * without the story rather than with half of one.
 */
export async function fetchCricketBallByBall(eventId: string, seriesId: string, opts: BallFetchOptions): Promise<unknown[] | null> {
  const fetchJson = opts.fetchJson ?? nextFetchJson;
  const edge = opts.settled ? FINISHED_REVALIDATE : LIVE_REVALIDATE;
  try {
    const first: any = await fetchJson(playByPlayUrl(seriesId, eventId, 1), edge);
    const meta = first?.commentary;
    if (!meta || typeof meta.pageCount !== "number") return null;
    const pageCount: number = meta.pageCount;
    if (pageCount <= 0) return [];
    if (pageCount > BALL_PAGE_CAP) return null;
    const items: unknown[] = [...(Array.isArray(meta.items) ? meta.items : [])];
    // The remaining pages are independent, so they are read together: a cold render of a T20 is two
    // round trips to ESPN, not nine.
    const rest = await Promise.all(Array.from({ length: pageCount - 1 }, (_, i) => fetchJson(playByPlayUrl(seriesId, eventId, i + 2), i + 2 === pageCount ? edge : FINISHED_REVALIDATE)));
    const pageSize = num(meta.pageSize, 25);
    rest.forEach((body: any, i) => {
      if (!Array.isArray(body?.commentary?.items)) throw new Error("page without items");
      // A middle page with room left is a stale copy of a page that was the last one a moment ago
      // (the live window keeps it up to 10 s): better no story this render than a gap in the innings.
      if (i + 2 < pageCount && body.commentary.items.length < pageSize) throw new Error("short middle page");
      items.push(...body.commentary.items);
    });
    return items;
  } catch {
    return null;
  }
}
