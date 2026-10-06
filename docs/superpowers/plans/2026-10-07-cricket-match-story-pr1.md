# Cricket Match Story, PR 1 (hero + match story chart) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the grey result card on `/cricket/matches/<id>` with a band-deep hero in team colours, and add the interactive "Match story" chart (run worm / runs per over with an over inspector) built from ESPN's ball-by-ball.

**Architecture:** Two pure modules (`cricketBalls.ts` parses ESPN's play-by-play into innings/overs/wickets/partnerships; `cricketMatchStoryModel.ts` turns that into SVG geometry), one small extras module for the summary's notes and team colours, one server component (hero) and one client component (chart + inspector), composed by the existing `cricketMatchPage.tsx`. No database change. Ball pages are fetched at render time through Next's data cache with per-page windows.

**Tech Stack:** Next 16 (app router, server components), React 19, TypeScript, Tailwind v4 utilities + `globals.css` tokens, `node:test` via `tsx`.

**Spec:** `docs/superpowers/specs/2026-10-07-cricket-match-story-design.md`

## Global Constraints

- Colours only through tokens (`--band-deep*`, `--sig`, `--sig-soft`, `--sig-on`, `--surface`, `--surface-muted`, `--border`, `--border-strong`, `--text`, `--text-muted`, `--text-faint`, `--loss`); ESPN `team.color` is the only inline colour, on bars/lines/dots.
- No new unlayered CSS and no `!` Tailwind modifiers (`tests/css-layers.test.ts` enforces).
- No ESPN prose on the page: symbols and SportsDB-written sentences only.
- Title, description, h1 text, report paragraph, JSON-LD, share card and the final-route caching stay unchanged.
- Client components render identical HTML on server and client (no `window` in render).
- Tests: `env -u NODE_ENV npx tsx --test tests/<file>.test.ts`; full suite, `npx next typegen && npx tsc --noEmit`, `npx eslint src tests` before the PR.
- Commits end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

---

### Task 1: Parse ball-by-ball into a match story

**Files:**
- Create: `src/lib/cricketBalls.ts`
- Test: `tests/cricket-balls.test.ts`
- Fixture (already written): `tests/fixtures/espn-cricket-playbyplay-1529230.json` (205 trimmed items of India v West Indies, 1st T20I, 2026-10-06)

**Interfaces:**
- Produces: `deriveMatchStory(items: unknown[]): StoryInnings[]` and the types `StoryBall`, `StoryOver`, `StoryWicket`, `StoryPartnership`, `StoryInnings` (below).

- [ ] **Step 1: Write the failing test**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { deriveMatchStory } from "../src/lib/cricketBalls";

const items = JSON.parse(readFileSync(new URL("./fixtures/espn-cricket-playbyplay-1529230.json", import.meta.url), "utf8")) as unknown[];

test("deriveMatchStory splits the balls into innings in match order with the batting side", () => {
  const story = deriveMatchStory(items);
  assert.equal(story.length, 2);
  assert.deepEqual(story.map((i) => [i.period, i.team, i.teamId]), [[1, "West Indies", "4"], [2, "India", "6"]]);
  assert.deepEqual(story[0].total, { runs: 171, wickets: 10, overs: 19.1 });
  assert.deepEqual(story[1].total, { runs: 172, wickets: 2, overs: 14.4 });
  assert.equal(story[0].runRate, 8.92);
  assert.equal(story[1].target, 172);
});

test("overs carry runs, wickets and one symbol per delivery", () => {
  const [wi, ind] = deriveMatchStory(items);
  assert.deepEqual(wi.overs.map((o) => o.runs), [5, 16, 7, 8, 8, 0, 9, 8, 15, 6, 18, 9, 6, 9, 3, 8, 10, 15, 11, 0]);
  assert.deepEqual(wi.overs.map((o) => o.wickets), [0, 0, 0, 0, 1, 2, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 0, 0, 1, 1]);
  assert.deepEqual(ind.overs.map((o) => o.runs), [15, 9, 11, 1, 11, 15, 5, 8, 19, 8, 12, 7, 19, 24, 8]);
  assert.deepEqual(ind.overs[13].balls.map((b) => b.symbol), ["6", "6", "1", "1", "4", "6"]);
  assert.deepEqual(wi.overs[5].balls.map((b) => b.symbol), ["0", "W", "0", "0", "W", "0"]);
  // the no-ball four in the 3rd over: four runs off the bat plus the extra, flagged nb
  const nb = wi.overs[2].balls[0];
  assert.deepEqual([nb.symbol, nb.runs, nb.extra], ["4", 5, "nb"]);
  // a leg-bye four keeps its runs and says so
  const lb = wi.overs[7].balls[5];
  assert.deepEqual([lb.symbol, lb.runs, lb.extra], ["4", 4, "lb"]);
  assert.equal(wi.overs[2].balls.length, 7);
});

test("wickets name the batter out, the dismissal and the bowler (none for a run out)", () => {
  const [wi, ind] = deriveMatchStory(items);
  assert.equal(wi.wickets.length, 10);
  assert.deepEqual(wi.wickets[0], { over: 4.3, runs: 38, wicket: 1, batter: "Kamil Pooran", how: "bowled", bowler: "Arshdeep Singh" });
  assert.deepEqual(wi.wickets[1], { over: 5.2, runs: 44, wicket: 2, batter: "Shimron Hetmyer", how: "run out", bowler: null });
  assert.deepEqual(ind.wickets.map((w) => [w.over, w.runs, w.batter]), [[2.3, 29, "Abhishek Sharma"], [3.3, 35, "Sanju Samson"]]);
});

test("partnerships are the runs between falls, with the pair at the crease, the last one unbroken", () => {
  const [wi, ind] = deriveMatchStory(items);
  assert.deepEqual(wi.partnerships.map((p) => p.runs), [38, 6, 0, 63, 7, 7, 3, 11, 36, 0]);
  assert.deepEqual(wi.partnerships[3], { wicket: 4, runs: 63, balls: 35, batters: ["Shai Hope", "Sherfane Rutherford"], unbroken: false });
  assert.deepEqual(ind.partnerships.map((p) => [p.runs, p.unbroken]), [[29, false], [6, false], [137, true]]);
  assert.deepEqual(ind.partnerships[2].batters, ["Shreyas Iyer", "Ishan Kishan"]);
  assert.equal(ind.partnerships[2].balls, 67);
});

test("the worm has a point per completed over and the final partial over", () => {
  const [wi, ind] = deriveMatchStory(items);
  assert.deepEqual(wi.worm[0], { over: 1, runs: 5, wickets: 0 });
  assert.deepEqual(wi.worm[19], { over: 19.17, runs: 171, wickets: 10 });
  assert.equal(ind.worm.length, 15);
  assert.deepEqual(ind.worm[14], { over: 14.67, runs: 172, wickets: 2 });
});

test("an empty or malformed list gives no innings", () => {
  assert.deepEqual(deriveMatchStory([]), []);
  assert.deepEqual(deriveMatchStory([{ nonsense: true }, null]), []);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `env -u NODE_ENV npx tsx --test tests/cricket-balls.test.ts`
Expected: FAIL, cannot find module `../src/lib/cricketBalls`.

- [ ] **Step 3: Write the implementation**

```ts
/* eslint-disable @typescript-eslint/no-explicit-any -- ESPN feed JSON has no published schema */
// ESPN's cricket play-by-play, read into the shape the match page's story needs: innings, overs,
// one symbol per delivery, the fall of each wicket and the partnerships between them.

export type BallExtra = "wd" | "nb" | "b" | "lb" | null;

export interface StoryBall {
  /** W, 4, 6, 0, or the run count. */
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
}

const name = (o: any): string => String(o?.athlete?.displayName ?? "");
const num = (v: unknown, fallback = 0): number => (typeof v === "number" && Number.isFinite(v) ? v : fallback);

/** 4.3 for ball 3 of over 5; the completed over's number when the over is complete. */
function position(over: any): number {
  if (over?.complete) return num(over.number);
  const legal = num(over?.ball);
  return Math.round((num(over?.number) - 1 + legal / 6) * 100) / 100;
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

function isBall(item: any): boolean {
  return item != null && typeof item === "object" && typeof item.period === "number" && item.over && typeof item.over === "object" && item.innings && typeof item.innings === "object";
}

/** The story of each innings from ESPN's play-by-play items, in sequence order. Items that are not balls are skipped. */
export function deriveMatchStory(items: unknown[]): StoryInnings[] {
  const balls = (items as any[]).filter(isBall).sort((a, b) => a.period - b.period || num(a.sequence) - num(b.sequence));
  const byPeriod = new Map<number, any[]>();
  for (const b of balls) {
    const list = byPeriod.get(b.period) ?? [];
    list.push(b);
    byPeriod.set(b.period, list);
  }
  const out: StoryInnings[] = [];
  for (const [period, list] of [...byPeriod.entries()].sort((a, b) => a[0] - b[0])) {
    const overs: StoryOver[] = [];
    for (const item of list) {
      const n = num(item.over.number);
      let over = overs[overs.length - 1];
      if (!over || over.number !== n) {
        over = { number: n, runs: 0, wickets: 0, balls: [] };
        overs.push(over);
      }
      over.balls.push(symbolOf(item));
      over.runs = num(item.over.runs, over.runs);
      over.wickets = num(item.over.wickets, over.wickets);
    }
    const last = list[list.length - 1];
    const worm: WormPoint[] = [];
    for (const over of overs) {
      const lastBall = list.filter((i) => num(i.over.number) === over.number).at(-1);
      worm.push({ over: position(lastBall.over), runs: num(lastBall.innings.runs), wickets: num(lastBall.innings.wickets) });
    }
    const wickets: StoryWicket[] = [];
    const partnerships: StoryPartnership[] = [];
    let fallRuns = 0;
    let fallBalls = 0;
    for (const item of list) {
      if (item.dismissal?.dismissal !== true) continue;
      const how = String(item.dismissal.type ?? "").toLowerCase();
      const runs = num(item.innings.runs);
      const ballsFaced = num(item.innings.balls);
      wickets.push({
        over: num(item.over.actual),
        runs,
        wicket: num(item.innings.wickets, wickets.length + 1),
        batter: name(item.dismissal.batsman) || name(item.batsman),
        how,
        bowler: how.includes("run out") ? null : name(item.dismissal.bowler) || null,
      });
      partnerships.push({ wicket: wickets.length, runs: runs - fallRuns, balls: ballsFaced - fallBalls, batters: [name(item.batsman), name(item.otherBatsman)], unbroken: false });
      fallRuns = runs;
      fallBalls = ballsFaced;
    }
    const total = { runs: num(last.innings.runs), wickets: num(last.innings.wickets), overs: num(last.over.actual) };
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
    });
  }
  return out;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `env -u NODE_ENV npx tsx --test tests/cricket-balls.test.ts`
Expected: 6 pass. If the worm's final point is `19` not `19.17`, `position()` is reading `complete` as true for a one-ball over: check the fixture's last item (`complete: false, ball: 1`).

- [ ] **Step 5: Commit**

```bash
git add src/lib/cricketBalls.ts tests/cricket-balls.test.ts tests/fixtures/espn-cricket-playbyplay-1529230.json
git commit -m "feat(cricket): derive a match story from ESPN ball-by-ball"
```

---

### Task 2: Fetch the ball-by-ball pages with per-page cache windows

**Files:**
- Modify: `src/lib/cricketBalls.ts` (append)
- Test: `tests/cricket-balls-fetch.test.ts`

**Interfaces:**
- Consumes: `LIVE_REVALIDATE` from `src/lib/cricketLive.ts` (10), `FINISHED_MATCH_REVALIDATE` from `src/lib/cricketMatchCache.ts` (86400), `baseSeriesId` from `src/lib/cricketSeriesKey.ts`.
- Produces: `fetchCricketBallByBall(eventId: string, seriesId: string, opts: BallFetchOptions): Promise<unknown[] | null>`; `BALL_PAGE_CAP = 40`; `playByPlayUrl(seriesId, eventId, page)`.

- [ ] **Step 1: Write the failing test**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchCricketBallByBall, BALL_PAGE_CAP, playByPlayUrl } from "../src/lib/cricketBalls";

const page = (index: number, count: number, pageCount: number) => ({ commentary: { count, pageIndex: index, pageSize: 25, pageCount, items: Array.from({ length: Math.min(25, count - (index - 1) * 25) }, (_, i) => ({ id: `${index}-${i}` })) } });

function recorder(pages: Record<number, unknown>) {
  const calls: { url: string; revalidate: number }[] = [];
  const fetchJson = async (url: string, revalidate: number) => {
    calls.push({ url, revalidate });
    const n = Number(new URL(url).searchParams.get("page"));
    if (!(n in pages)) throw new Error(`no page ${n}`);
    return pages[n];
  };
  return { calls, fetchJson };
}

test("the url names the series path, the event and the page", () => {
  assert.equal(playByPlayUrl("8669", "1529230", 3), "https://site.web.api.espn.com/apis/site/v2/sports/cricket/8669/playbyplay?event=1529230&page=3");
});

test("a live match reads the first and last page with the live window and the middle with the long one", async () => {
  const r = recorder({ 1: page(1, 70, 3), 2: page(2, 70, 3), 3: page(3, 70, 3) });
  const items = await fetchCricketBallByBall("1529230", "8669", { settled: false, fetchJson: r.fetchJson });
  assert.equal(items?.length, 70);
  assert.deepEqual(r.calls.map((c) => [Number(new URL(c.url).searchParams.get("page")), c.revalidate]), [[1, 10], [2, 86400], [3, 10]]);
});

test("a settled match reads every page with the long window", async () => {
  const r = recorder({ 1: page(1, 30, 2), 2: page(2, 30, 2) });
  await fetchCricketBallByBall("1529230", "8669", { settled: true, fetchJson: r.fetchJson });
  assert.deepEqual(r.calls.map((c) => c.revalidate), [86400, 86400]);
});

test("an upcoming match has no pages and gives an empty list", async () => {
  const r = recorder({ 1: page(1, 0, 0) });
  assert.deepEqual(await fetchCricketBallByBall("1", "8669", { settled: false, fetchJson: r.fetchJson }), []);
  assert.equal(r.calls.length, 1);
});

test("a failed page or an error body gives null, never a partial story", async () => {
  const r = recorder({ 1: page(1, 70, 3), 2: page(2, 70, 3) });
  assert.equal(await fetchCricketBallByBall("1", "8669", { settled: true, fetchJson: r.fetchJson }), null);
  const e = recorder({ 1: { code: 2502, detail: "http error: bad gateway" } });
  assert.equal(await fetchCricketBallByBall("1", "8669", { settled: true, fetchJson: e.fetchJson }), null);
});

test("it stops at the page cap", async () => {
  const pages: Record<number, unknown> = {};
  for (let i = 1; i <= 60; i++) pages[i] = page(i, 1500, 60);
  const r = recorder(pages);
  assert.equal(await fetchCricketBallByBall("1", "8669", { settled: true, fetchJson: r.fetchJson }), null);
  assert.equal(r.calls.length, BALL_PAGE_CAP);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `env -u NODE_ENV npx tsx --test tests/cricket-balls-fetch.test.ts`
Expected: FAIL, `fetchCricketBallByBall` is not exported.

- [ ] **Step 3: Write the implementation** (append to `src/lib/cricketBalls.ts`; add the imports at the top of the file)

```ts
import { LIVE_REVALIDATE } from "./cricketLive";
import { FINISHED_MATCH_REVALIDATE } from "./cricketMatchCache";
import { baseSeriesId } from "./cricketSeriesKey";

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

async function nextFetchJson(url: string, revalidate: number): Promise<unknown> {
  const res = await fetch(url, { next: { revalidate } });
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
  const edge = opts.settled ? FINISHED_MATCH_REVALIDATE : LIVE_REVALIDATE;
  try {
    const first: any = await fetchJson(playByPlayUrl(seriesId, eventId, 1), edge);
    const meta = first?.commentary;
    if (!meta || typeof meta.pageCount !== "number") return null;
    const pageCount: number = meta.pageCount;
    if (pageCount <= 0) return [];
    const items: unknown[] = [...(Array.isArray(meta.items) ? meta.items : [])];
    for (let page = 2; page <= pageCount; page++) {
      if (page > BALL_PAGE_CAP) return null;
      const body: any = await fetchJson(playByPlayUrl(seriesId, eventId, page), page === pageCount ? edge : FINISHED_MATCH_REVALIDATE);
      if (!Array.isArray(body?.commentary?.items)) return null;
      items.push(...body.commentary.items);
    }
    return items;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run both ball tests**

Run: `env -u NODE_ENV npx tsx --test tests/cricket-balls.test.ts tests/cricket-balls-fetch.test.ts`
Expected: 12 pass. Importing `cricketMatchCache` pulls in `./db`; if that throws at import without `DATABASE_URL`, import `FINISHED_MATCH_REVALIDATE` by re-declaring the constant locally with a comment pointing at the source instead.

- [ ] **Step 5: Commit**

```bash
git add src/lib/cricketBalls.ts tests/cricket-balls-fetch.test.ts
git commit -m "feat(cricket): fetch ball-by-ball pages with per-page cache windows"
```

---

### Task 3: Chart geometry

**Files:**
- Create: `src/lib/cricketMatchStoryModel.ts`
- Test: `tests/cricket-match-story-model.test.ts`

**Interfaces:**
- Consumes: `StoryInnings` from Task 1.
- Produces: `matchStoryModel(innings: StoryInnings[]): StoryModel` with `StoryModel = { width: 1000; height: 340; plot: { x0, x1, y0, y1 }; overLimit: number; worm: { teamId, points: string, end: { x, y, label } }[]; wormWickets: { x, y, teamId }[]; wormGrid: { y, label }[]; bars: { teamId, over, x, y, w, h, wickets }[]; barGrid: { y, label }[]; axis: { x, label }[]; hitZones: { over, x, w }[]; defaultOver: number }`.

- [ ] **Step 1: Write the failing test**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { deriveMatchStory } from "../src/lib/cricketBalls";
import { matchStoryModel } from "../src/lib/cricketMatchStoryModel";

const items = JSON.parse(readFileSync(new URL("./fixtures/espn-cricket-playbyplay-1529230.json", import.meta.url), "utf8")) as unknown[];
const story = deriveMatchStory(items);

test("the worm starts at the origin and ends at each side's total", () => {
  const m = matchStoryModel(story);
  assert.equal(m.overLimit, 20);
  assert.equal(m.worm.length, 2);
  assert.ok(m.worm[0].points.startsWith(`${m.plot.x0},${m.plot.y1}`));
  assert.equal(m.worm[1].end.label, "172/2");
  assert.equal(m.worm[0].end.label, "171");
  const lastInd = m.worm[1].points.split(" ").at(-1)!.split(",").map(Number);
  assert.ok(lastInd[0] < m.plot.x1 && lastInd[0] > m.plot.x0 + (m.plot.x1 - m.plot.x0) * 0.7);
  assert.equal(lastInd[1], m.plot.y1 - (172 / 200) * (m.plot.y1 - m.plot.y0));
});

test("wicket markers sit on the line at the fall of wicket", () => {
  const m = matchStoryModel(story);
  assert.equal(m.wormWickets.length, 12);
  const first = m.wormWickets[0];
  assert.equal(first.teamId, "4");
  assert.equal(first.x, m.plot.x0 + (4.5 / 20) * (m.plot.x1 - m.plot.x0));
  assert.equal(first.y, m.plot.y1 - (38 / 200) * (m.plot.y1 - m.plot.y0));
});

test("bars are one pair per over, scaled to the biggest over rounded up to a multiple of six", () => {
  const m = matchStoryModel(story);
  assert.equal(m.bars.length, 35);
  const big = m.bars.find((b) => b.teamId === "6" && b.over === 14)!;
  assert.equal(big.h, m.plot.y1 - m.plot.y0);
  assert.deepEqual(m.barGrid.map((g) => g.label), ["0", "6", "12", "18", "24"]);
  const zero = m.bars.find((b) => b.teamId === "4" && b.over === 6)!;
  assert.equal(zero.h, 2);
  assert.equal(zero.wickets, 2);
});

test("hit zones cover every over to the limit and the default over is the biggest", () => {
  const m = matchStoryModel(story);
  assert.equal(m.hitZones.length, 20);
  assert.equal(m.defaultOver, 14);
  assert.deepEqual(m.axis.map((a) => a.label), ["Overs", "5", "10", "15", "20"]);
});

test("an empty story still gives a drawable frame", () => {
  const m = matchStoryModel([]);
  assert.equal(m.overLimit, 20);
  assert.deepEqual(m.worm, []);
  assert.equal(m.defaultOver, 1);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `env -u NODE_ENV npx tsx --test tests/cricket-match-story-model.test.ts`
Expected: FAIL, cannot find module.

- [ ] **Step 3: Write the implementation**

```ts
// Geometry for the match story chart: pure numbers, so the client component only maps them to SVG.
import type { StoryInnings } from "./cricketBalls";

export interface StoryModel {
  width: number;
  height: number;
  plot: { x0: number; x1: number; y0: number; y1: number };
  overLimit: number;
  worm: { teamId: string; points: string; end: { x: number; y: number; label: string } }[];
  wormWickets: { x: number; y: number; teamId: string }[];
  wormGrid: { y: number; label: string }[];
  bars: { teamId: string; over: number; x: number; y: number; w: number; h: number; wickets: number }[];
  barGrid: { y: number; label: string }[];
  axis: { x: number; label: string }[];
  hitZones: { over: number; x: number; w: number }[];
  defaultOver: number;
}

const WIDTH = 1000;
const HEIGHT = 340;
const PLOT = { x0: 40, x1: 980, y0: 20, y1: 300 };

const r1 = (n: number) => Math.round(n * 10) / 10;

export function matchStoryModel(innings: StoryInnings[]): StoryModel {
  const oversPlayed = Math.max(0, ...innings.map((i) => i.overs.length));
  // A T20 is 20 overs, an ODI 50; a reduced match keeps its own limit from the overs bowled.
  const overLimit = oversPlayed <= 20 ? 20 : oversPlayed <= 50 ? 50 : Math.ceil(oversPlayed / 10) * 10;
  const topRuns = Math.max(0, ...innings.map((i) => i.total.runs));
  const runMax = Math.max(50, Math.ceil(topRuns / 50) * 50);
  const topOver = Math.max(0, ...innings.flatMap((i) => i.overs.map((o) => o.runs)));
  const barMax = Math.max(12, Math.ceil(topOver / 6) * 6);
  const xOf = (over: number) => PLOT.x0 + (over / overLimit) * (PLOT.x1 - PLOT.x0);
  const yRuns = (runs: number) => PLOT.y1 - (runs / runMax) * (PLOT.y1 - PLOT.y0);
  const yBar = (runs: number) => PLOT.y1 - (runs / barMax) * (PLOT.y1 - PLOT.y0);

  const worm = innings.map((inn) => {
    const pts = [`${PLOT.x0},${PLOT.y1}`, ...inn.worm.map((p) => `${r1(xOf(p.over))},${r1(yRuns(p.runs))}`)];
    const last = inn.worm.at(-1);
    const label = inn.total.wickets >= 10 ? String(inn.total.runs) : `${inn.total.runs}/${inn.total.wickets}`;
    return { teamId: inn.teamId, points: pts.join(" "), end: { x: r1(last ? xOf(last.over) : PLOT.x0), y: r1(last ? yRuns(last.runs) : PLOT.y1), label } };
  });
  const wormWickets = innings.flatMap((inn) => inn.wickets.map((w) => ({ x: xOf(Math.floor(w.over) + ((w.over % 1) * 10) / 6), y: yRuns(w.runs), teamId: inn.teamId })));
  const wormStep = runMax <= 100 ? 25 : 50;
  const wormGrid = Array.from({ length: Math.floor(runMax / wormStep) }, (_, i) => ({ y: r1(yRuns(i * wormStep)), label: String(i * wormStep) }));

  const cell = (PLOT.x1 - PLOT.x0) / overLimit;
  const barW = Math.max(2, cell / 2 - 3);
  const bars = innings.flatMap((inn, side) =>
    inn.overs.map((o) => {
      const x = PLOT.x0 + (o.number - 1) * cell + 1.5 + side * (barW + 3);
      const h = o.runs === 0 ? 2 : PLOT.y1 - yBar(o.runs);
      return { teamId: inn.teamId, over: o.number, x: r1(x), y: r1(PLOT.y1 - h), w: r1(barW), h: r1(h), wickets: o.wickets };
    })
  );
  const barGrid = Array.from({ length: barMax / 6 + 1 }, (_, i) => ({ y: r1(yBar(i * 6)), label: String(i * 6) }));
  const axisStep = overLimit <= 20 ? 5 : 10;
  const axis = Array.from({ length: overLimit / axisStep + 1 }, (_, i) => ({ x: r1(xOf(i * axisStep)), label: i === 0 ? "Overs" : String(i * axisStep) }));
  const hitZones = Array.from({ length: overLimit }, (_, i) => ({ over: i + 1, x: r1(PLOT.x0 + i * cell), w: r1(cell) }));

  let defaultOver = 1;
  let best = -1;
  for (const inn of innings) for (const o of inn.overs) if (o.runs >= best) { best = o.runs; defaultOver = o.number; }

  return { width: WIDTH, height: HEIGHT, plot: PLOT, overLimit, worm, wormWickets, wormGrid, bars, barGrid, axis, hitZones, defaultOver };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `env -u NODE_ENV npx tsx --test tests/cricket-match-story-model.test.ts`
Expected: 5 pass. (`wormWickets` x and y are not rounded, so the equality assertions hold exactly.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/cricketMatchStoryModel.ts tests/cricket-match-story-model.test.ts
git commit -m "feat(cricket): geometry for the match story chart"
```

---

### Task 4: Summary extras: pills, team colours, score split

**Files:**
- Create: `src/lib/cricketMatchExtras.ts`
- Test: `tests/cricket-match-extras.test.ts`

**Interfaces:**
- Produces: `matchPills(notes: unknown): string[]`, `teamColours(summary: unknown): { home: string | null; away: string | null }`, `splitCricketScore(score: string): { main: string; detail: string | null }`, `overNote(over, innings, team): string` (the one-line note under an over's balls).

- [ ] **Step 1: Write the failing test**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { deriveMatchStory } from "../src/lib/cricketBalls";
import { matchPills, teamColours, splitCricketScore, overNote } from "../src/lib/cricketMatchExtras";

const notes = [
  { type: "seriesnote", text: "India led the 5-match series 1-0" },
  { type: "matchnumber", text: "T20I no. 4166" },
  { type: "season", text: "2026/27" },
  { type: "matchdays", text: "6 October 2026 - night match (20-over match)" },
  { type: "toss", text: "India , elected to field first" },
  { type: "livecommentator", text: "S Sudarshanan" },
  { type: "matchnote", text: "Powerplay: Overs 0.1 - 6.0 (Mandatory - 44 runs, 3 wickets)" },
];

test("pills: toss, series note, match number and the day/night note, nothing else", () => {
  assert.deepEqual(matchPills(notes), ["Toss: India, elected to field first", "India lead the 5-match series 1-0", "T20I no. 4166", "Night match"]);
  assert.deepEqual(matchPills(undefined), []);
  assert.deepEqual(matchPills([{ type: "toss", text: "West Indies , elected to bat first" }]), ["Toss: West Indies, elected to bat first"]);
});

test("team colours come from the header competitors, null when missing or identical", () => {
  const summary = { header: { competitions: [{ competitors: [{ homeAway: "home", team: { color: "050ceb" } }, { homeAway: "away", team: { color: "#790d1a" } }] }] } };
  assert.deepEqual(teamColours(summary), { home: "#050ceb", away: "#790d1a" });
  assert.deepEqual(teamColours({ header: { competitions: [{ competitors: [{ homeAway: "home", team: { color: "#111111" } }, { homeAway: "away", team: { color: "#111111" } }] }] } }), { home: null, away: null });
  assert.deepEqual(teamColours(null), { home: null, away: null });
});

test("a score splits into the figure and the overs detail", () => {
  assert.deepEqual(splitCricketScore("172/2 (14.4/20 ov, target 172)"), { main: "172/2", detail: "14.4/20 ov, target 172" });
  assert.deepEqual(splitCricketScore("171"), { main: "171", detail: null });
  assert.deepEqual(splitCricketScore("236 & 171/4d"), { main: "236 & 171/4d", detail: null });
  assert.deepEqual(splitCricketScore(""), { main: "", detail: null });
});

test("the over note is a wicket line, else the score after the over", () => {
  const items = JSON.parse(readFileSync(new URL("./fixtures/espn-cricket-playbyplay-1529230.json", import.meta.url), "utf8")) as unknown[];
  const [wi, ind] = deriveMatchStory(items);
  assert.equal(overNote(wi.overs[5], wi), "Shimron Hetmyer run out 5; Rovman Powell b Axar Patel 0. West Indies 44/3 after 6 overs.");
  assert.equal(overNote(ind.overs[13], ind), "India 164/2 after 14 overs.");
  assert.equal(overNote(wi.overs[19], wi), "Akeal Hosein c Axar Patel 15. West Indies 171 all out.");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `env -u NODE_ENV npx tsx --test tests/cricket-match-extras.test.ts`
Expected: FAIL, cannot find module.

- [ ] **Step 3: Write the implementation**

```ts
/* eslint-disable @typescript-eslint/no-explicit-any -- ESPN feed JSON has no published schema */
// Small facts the match page lifts from ESPN's summary and the match story: hero pills, team colours,
// the score split for display, and the sentence under an over's balls.
import type { StoryInnings, StoryOver, StoryWicket } from "./cricketBalls";

const clean = (s: string) => s.replace(/\s+,/g, ",").replace(/\s+/g, " ").trim();

/** The hero's outline pills, in a fixed order: toss, series state, match number, day/night. */
export function matchPills(notes: unknown): string[] {
  if (!Array.isArray(notes)) return [];
  const by = (type: string) => notes.find((n: any) => n?.type === type && typeof n.text === "string")?.text as string | undefined;
  const out: string[] = [];
  const toss = by("toss");
  if (toss) out.push(`Toss: ${clean(toss)}`);
  const series = by("seriesnote");
  // ESPN writes the series state in the past tense ("led"); the page is read in the present.
  if (series) out.push(clean(series).replace(/\bled\b/, "lead").replace(/\btrailed\b/, "trail"));
  const number = by("matchnumber");
  if (number) out.push(clean(number));
  const days = by("matchdays");
  if (days && /night match/i.test(days)) out.push(/day\/night/i.test(days) ? "Day/night match" : "Night match");
  return out;
}

const hex = (c: unknown): string | null => {
  if (typeof c !== "string") return null;
  const v = c.trim().replace(/^#/, "");
  return /^[0-9a-fA-F]{6}$/.test(v) ? `#${v.toLowerCase()}` : null;
};

/** ESPN's team colours for the home and away competitor; none when either is missing or both are the same. */
export function teamColours(summary: unknown): { home: string | null; away: string | null } {
  const comps: any[] = (summary as any)?.header?.competitions?.[0]?.competitors ?? [];
  const home = hex(comps.find((c) => c?.homeAway === "home")?.team?.color ?? comps[0]?.team?.color);
  const away = hex(comps.find((c) => c?.homeAway === "away")?.team?.color ?? comps[1]?.team?.color);
  if (!home || !away || home === away) return { home: null, away: null };
  return { home, away };
}

/** "172/2 (14.4/20 ov, target 172)" as the figure and the bracketed detail. */
export function splitCricketScore(score: string): { main: string; detail: string | null } {
  const m = /^(.*?)\s*\(([^)]*)\)\s*$/.exec(score.trim());
  if (!m) return { main: score.trim(), detail: null };
  return { main: m[1].trim(), detail: m[2].trim() || null };
}

function wicketLine(w: StoryWicket, batterRuns: number | null): string {
  const how = w.how.includes("run out") ? "run out" : w.how.includes("leg before") ? `lbw b ${w.bowler}` : w.how === "bowled" ? `b ${w.bowler}` : w.how === "caught" ? `c ${w.bowler}` : w.how === "stumped" ? `st ${w.bowler}` : w.bowler ? `${w.how} b ${w.bowler}` : w.how;
  return `${w.batter} ${how}${batterRuns === null ? "" : ` ${batterRuns}`}`;
}

/**
 * The sentence under an over's balls: each wicket in it as a scorecard line (runs from the dismissal
 * ball when the story has them), then the side's score after the over.
 */
export function overNote(over: StoryOver, innings: StoryInnings): string {
  const inOver = innings.wickets.filter((w) => Math.floor(w.over) === over.number - 1);
  const parts: string[] = [];
  if (inOver.length) parts.push(inOver.map((w) => wicketLine(w, w.batterRuns ?? null)).join("; ") + ".");
  const point = innings.worm.find((p) => Math.ceil(p.over) === over.number) ?? innings.worm.at(-1);
  if (point) {
    const allOut = point.wickets >= 10;
    const score = allOut ? `${point.runs} all out` : `${point.runs}/${point.wickets}`;
    const after = Number.isInteger(point.over) ? ` after ${point.over} overs` : "";
    parts.push(`${innings.team} ${score}${allOut && !Number.isInteger(point.over) ? "" : after}.`);
  }
  return parts.join(" ");
}
```

`wicketLine` reads `w.batterRuns`; add it to Task 1's `StoryWicket` as `batterRuns: number | null` set from `dismissal.batsman` when it is the striker (`item.batsman.totalRuns`), else null, and update Task 1's wicket assertions to include it (`batterRuns: 12` for Pooran, `null` for the run-out Hetmyer who was the non-striker; the over-6 note then reads "Shimron Hetmyer run out; Rovman Powell b Axar Patel 0." — change the extras test's expected string to match: `"Shimron Hetmyer run out; Rovman Powell b Axar Patel 0. West Indies 44/3 after 6 overs."`).

- [ ] **Step 4: Run the extras and balls tests**

Run: `env -u NODE_ENV npx tsx --test tests/cricket-match-extras.test.ts tests/cricket-balls.test.ts`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/cricketMatchExtras.ts src/lib/cricketBalls.ts tests/cricket-match-extras.test.ts tests/cricket-balls.test.ts
git commit -m "feat(cricket): hero pills, team colours, score split and over notes"
```

---

### Task 5: The match story client component

**Files:**
- Create: `src/components/CricketMatchStory.tsx`
- Test: `tests/cricket-match-story-render.test.ts`

**Interfaces:**
- Consumes: `StoryInnings` (Task 1), `matchStoryModel` (Task 3), `overNote` (Task 4).
- Produces: `CricketMatchStory({ innings, colours }: { innings: StoryInnings[]; colours: Record<string, string> })` where `colours` maps `teamId` to a CSS colour (falls back to `var(--sig)` and `var(--text-muted)`).

- [ ] **Step 1: Write the failing test**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { deriveMatchStory } from "../src/lib/cricketBalls";
import { CricketMatchStory } from "../src/components/CricketMatchStory";

const items = JSON.parse(readFileSync(new URL("./fixtures/espn-cricket-playbyplay-1529230.json", import.meta.url), "utf8")) as unknown[];
const innings = deriveMatchStory(items);

test("the story renders the worm by default with both lines, the legend and the biggest over selected", () => {
  const html = renderToStaticMarkup(createElement(CricketMatchStory, { innings, colours: { "4": "#790d1a", "6": "#050ceb" } }));
  assert.match(html, /Match story/);
  assert.equal((html.match(/<polyline/g) ?? []).length, 2);
  assert.match(html, /stroke="#050ceb"/);
  assert.match(html, /aria-pressed="true"[^>]*>Run worm/);
  assert.match(html, /Over 14 · India · 24 runs/);
  assert.match(html, /India 164\/2 after 14 overs\./);
  assert.match(html, /Over 14 · West Indies · 9 runs, 1 wicket/);
  assert.equal((html.match(/<circle/g) ?? []).length, 12);
});

test("every over has a clickable hit zone and the discs carry their symbols", () => {
  const html = renderToStaticMarkup(createElement(CricketMatchStory, { innings, colours: {} }));
  assert.equal((html.match(/data-over="/g) ?? []).length, 20);
  assert.match(html, />6<\/span>/);
  assert.match(html, /aria-label="Over 14, India: 6, 6, 1, 1, 4, 6"/);
});

test("no innings renders nothing", () => {
  assert.equal(renderToStaticMarkup(createElement(CricketMatchStory, { innings: [], colours: {} })), "");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `env -u NODE_ENV npx tsx --test tests/cricket-match-story-render.test.ts`
Expected: FAIL, cannot find module.

- [ ] **Step 3: Write the component**

```tsx
"use client";

import { useState } from "react";
import type { StoryInnings, StoryOver } from "@/lib/cricketBalls";
import { matchStoryModel } from "@/lib/cricketMatchStoryModel";
import { overNote } from "@/lib/cricketMatchExtras";
import { SectionHeader } from "@/components/SectionHeader";

const FALLBACK = ["var(--sig)", "var(--text-muted)"];

function Disc({ symbol, extra, wicket }: { symbol: string; extra: string | null; wicket: boolean }) {
  const tone = wicket
    ? "bg-[var(--loss)] text-white"
    : symbol === "6"
      ? "bg-[var(--text)] text-[var(--surface)]"
      : symbol === "4"
        ? "bg-[var(--sig)] text-[var(--sig-on)]"
        : symbol === "0"
          ? "bg-[var(--surface-muted)] text-[var(--text-faint)]"
          : "bg-[var(--sig-soft)] text-[var(--text)]";
  return (
    <span className={`relative inline-flex h-[34px] w-[34px] items-center justify-center rounded-full text-[13px] font-extrabold tabular-nums ${tone}`}>
      {symbol}
      {extra && <span className="absolute -right-1 -top-1 rounded-full bg-[var(--surface)] px-1 text-[9px] font-bold uppercase text-[var(--text-muted)] ring-1 ring-[var(--border)]">{extra}</span>}
    </span>
  );
}

function OverPanel({ over, innings, colour, number }: { over: StoryOver | undefined; innings: StoryInnings; colour: string; number: number }) {
  const summary = over ? `${over.runs} run${over.runs === 1 ? "" : "s"}${over.wickets ? `, ${over.wickets} wicket${over.wickets > 1 ? "s" : ""}` : ""}` : "not bowled";
  return (
    <div className="flex min-w-0 flex-1 basis-[280px] flex-col gap-2">
      <span className="eyebrow" style={{ color: colour }}>
        Over {number} · {innings.team} · {summary}
      </span>
      {over && (
        <div className="flex flex-wrap gap-1.5" aria-label={`Over ${number}, ${innings.team}: ${over.balls.map((b) => b.symbol).join(", ")}`}>
          {over.balls.map((b, i) => (
            <Disc key={i} symbol={b.symbol} extra={b.extra} wicket={b.wicket} />
          ))}
        </div>
      )}
      <span className="text-[13px] text-[var(--text-muted)]">{over ? overNote(over, innings) : innings.total.wickets < 10 && innings.target && innings.total.runs >= innings.target ? `${innings.team} had already won.` : ""}</span>
    </div>
  );
}

/**
 * The match as a chart: the run worm or runs per over for every innings, wickets marked, and an
 * inspector under it showing the balls of one over. The first render on the server and the client
 * are identical (state starts from the model's default over), so the page can still be cached.
 */
export function CricketMatchStory({ innings, colours }: { innings: StoryInnings[]; colours: Record<string, string> }) {
  const model = matchStoryModel(innings);
  const [view, setView] = useState<"worm" | "bars">("worm");
  const [over, setOver] = useState(model.defaultOver);
  if (innings.length === 0) return null;
  const colourOf = (teamId: string, i: number) => colours[teamId] ?? FALLBACK[i % FALLBACK.length];
  const sides = innings.map((inn, i) => ({ inn, colour: colourOf(inn.teamId, i) }));
  const seg = (on: boolean) => `rounded-full px-3.5 py-1.5 text-[13px] font-bold ${on ? "bg-[var(--surface)] text-[var(--text)] shadow-sm" : "text-[var(--text-muted)]"}`;
  const grid = view === "worm" ? model.wormGrid : model.barGrid;

  return (
    <section className="flex flex-col gap-3" aria-label="Match story">
      <SectionHeader description="Over by over, from the ball-by-ball. Click an over to see its balls.">Match story</SectionHeader>
      <div className="card flex flex-col gap-3.5 px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-4 text-[13px] text-[var(--text-muted)]">
            {sides.map(({ inn, colour }) => (
              <span key={inn.period} className="flex items-center gap-1.5">
                <span className="h-1 w-3.5 rounded-sm" style={{ background: colour }} />
                {inn.team} {inn.total.wickets >= 10 ? `${inn.total.runs} all out` : `${inn.total.runs}/${inn.total.wickets}`}
              </span>
            ))}
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full border-2 border-[var(--text)] bg-[var(--surface)]" />
              Wicket
            </span>
          </div>
          <div role="group" aria-label="Chart type" className="flex gap-0.5 rounded-full bg-[var(--surface-muted)] p-0.5">
            <button type="button" onClick={() => setView("worm")} aria-pressed={view === "worm"} className={seg(view === "worm")}>Run worm</button>
            <button type="button" onClick={() => setView("bars")} aria-pressed={view === "bars"} className={seg(view === "bars")}>Runs per over</button>
          </div>
        </div>

        <svg viewBox={`0 0 ${model.width} ${model.height}`} className="block h-auto w-full" role="img" aria-label="Runs over the match for each innings">
          {grid.map((g) => (
            <g key={g.label}>
              <line x1={model.plot.x0} x2={model.plot.x1} y1={g.y} y2={g.y} stroke="var(--border)" strokeWidth="1" />
              <text x={model.plot.x0 - 6} y={g.y + 4} fontSize="11" fill="var(--text-faint)" textAnchor="end">{g.label}</text>
            </g>
          ))}
          {model.axis.map((a) => (
            <text key={a.label} x={a.x} y={model.height - 12} fontSize="11" fill="var(--text-faint)" textAnchor="middle">{a.label}</text>
          ))}
          {view === "worm" &&
            model.worm.map((w, i) => (
              <g key={w.teamId}>
                <polyline points={w.points} fill="none" stroke={colourOf(w.teamId, i)} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
                <text x={w.end.x + 8} y={w.end.y + 4} fontSize="12" fontWeight="700" fill={colourOf(w.teamId, i)}>{w.end.label}</text>
              </g>
            ))}
          {view === "worm" &&
            model.wormWickets.map((w, i) => (
              <circle key={i} cx={w.x} cy={w.y} r="5" fill="var(--surface)" stroke={colourOf(w.teamId, innings.findIndex((inn) => inn.teamId === w.teamId))} strokeWidth="2.5" />
            ))}
          {view === "bars" &&
            model.bars.map((b) => (
              <g key={`${b.teamId}-${b.over}`}>
                <rect x={b.x} y={b.y} width={b.w} height={b.h} rx="2" fill={colourOf(b.teamId, innings.findIndex((inn) => inn.teamId === b.teamId))} opacity={b.over === over ? 1 : 0.7} />
                {Array.from({ length: b.wickets }, (_, k) => (
                  <circle key={k} cx={b.x + b.w / 2} cy={b.y - 8 - k * 11} r="4" fill="var(--surface)" stroke={colourOf(b.teamId, innings.findIndex((inn) => inn.teamId === b.teamId))} strokeWidth="2" />
                ))}
              </g>
            ))}
          {model.hitZones.map((z) => (
            <rect key={z.over} data-over={z.over} x={z.x} y={model.plot.y0} width={z.w} height={model.plot.y1 - model.plot.y0 + 10} fill="var(--sig)" opacity={z.over === over ? 0.08 : 0} className="cursor-pointer" onClick={() => setOver(z.over)}>
              <title>Over {z.over}</title>
            </rect>
          ))}
        </svg>

        <div className="flex flex-wrap gap-4 border-t border-[var(--border)] pt-3.5">
          {sides.map(({ inn, colour }) => (
            <OverPanel key={inn.period} over={inn.overs[over - 1]} innings={inn} colour={colour} number={over} />
          ))}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `env -u NODE_ENV npx tsx --test tests/cricket-match-story-render.test.ts`
Expected: 3 pass. `useState` inside `renderToStaticMarkup` is fine (initial state only). If `tsx` cannot compile the `.tsx` import, check that other tests import `.tsx` components the same way (`tests/breadcrumbs.test.ts` does).

- [ ] **Step 5: Commit**

```bash
git add src/components/CricketMatchStory.tsx tests/cricket-match-story-render.test.ts
git commit -m "feat(cricket): match story chart with an over inspector"
```

---

### Task 6: The hero

**Files:**
- Create: `src/components/CricketMatchHero.tsx`
- Test: `tests/cricket-match-hero-render.test.ts`

**Interfaces:**
- Consumes: `TeamLogo`, `LocalTime`, `splitCricketScore` (Task 4).
- Produces:

```ts
export interface HeroSide { name: string; score: string; winner: boolean; logo: string | null; colour: string | null }
export interface CricketMatchHeroProps {
  state: "pre" | "in" | "post";
  calledOff: string | null;
  headline: string;            // the h1 text, unchanged from today
  date: string | null;
  sides: [HeroSide, HeroSide];
  result: string | null;       // "India won by 8 wkts (32b rem)" via teamDisplayName, post only
  potm: { name: string; line: string | null } | null;
  pills: string[];
  liveLine: string | null;     // "Run rate 11.72 · required 8.40" while in play, else null
  venue: string | null;        // shown when there is no result (fixture)
}
```

- [ ] **Step 1: Write the failing test**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CricketMatchHero } from "../src/components/CricketMatchHero";

const base = {
  state: "post" as const,
  calledOff: null,
  headline: "India vs West Indies · 1st T20I · West Indies tour of India 2026/27",
  date: "2026-10-06T13:30Z",
  sides: [
    { name: "India", score: "172/2 (14.4/20 ov, target 172)", winner: true, logo: null, colour: "#050ceb" },
    { name: "West Indies", score: "171", winner: false, logo: null, colour: "#790d1a" },
  ] as [never, never],
  result: "India won by 8 wkts (32b rem)",
  potm: { name: "Shreyas Iyer", line: "102* (43)" },
  pills: ["Toss: India, elected to field first", "T20I no. 4166"],
  liveLine: null,
  venue: null,
};

test("a result: band-deep card, h1 kept, display scores split, result line, potm chip, pills", () => {
  const html = renderToStaticMarkup(createElement(CricketMatchHero, base));
  assert.match(html, /class="[^"]*band-deep/);
  assert.match(html, /<h1[^>]*>India vs West Indies · 1st T20I · West Indies tour of India 2026\/27<\/h1>/);
  assert.match(html, />Result</);
  assert.match(html, /display[^"]*"[^>]*>172\/2</);
  assert.match(html, /14\.4\/20 ov, target 172/);
  assert.match(html, /India won by 8 wkts \(32b rem\)/);
  assert.match(html, /Player of the Match/);
  assert.match(html, /Shreyas Iyer/);
  assert.match(html, /102\* \(43\)/);
  assert.match(html, /Toss: India, elected to field first/);
  assert.match(html, /background:#050ceb/);
});

test("a live match shows the live pill and the rate line, no result", () => {
  const html = renderToStaticMarkup(createElement(CricketMatchHero, { ...base, state: "in", result: null, potm: null, liveLine: "Run rate 11.72 · required 8.40" }));
  assert.match(html, /pill-live/);
  assert.match(html, /Run rate 11\.72 · required 8\.40/);
  assert.doesNotMatch(html, /won by/);
});

test("a fixture shows Upcoming and the venue; a called-off match shows why", () => {
  const pre = renderToStaticMarkup(createElement(CricketMatchHero, { ...base, state: "pre", result: null, potm: null, venue: "Ekana Cricket Stadium, Lucknow", sides: [{ ...base.sides[0], score: "" }, { ...base.sides[1], score: "" }] as [never, never] }));
  assert.match(pre, /Upcoming/);
  assert.match(pre, /Ekana Cricket Stadium, Lucknow/);
  const off = renderToStaticMarkup(createElement(CricketMatchHero, { ...base, calledOff: "Abandoned", result: null }));
  assert.match(off, />Abandoned</);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `env -u NODE_ENV npx tsx --test tests/cricket-match-hero-render.test.ts`
Expected: FAIL, cannot find module.

- [ ] **Step 3: Write the component**

```tsx
import { TeamLogo } from "@/components/TeamLogo";
import { LocalTime } from "@/components/LocalTime";
import { splitCricketScore } from "@/lib/cricketMatchExtras";

export interface HeroSide {
  name: string;
  score: string;
  winner: boolean;
  logo: string | null;
  colour: string | null;
}

export interface CricketMatchHeroProps {
  state: "pre" | "in" | "post";
  calledOff: string | null;
  headline: string;
  date: string | null;
  sides: [HeroSide, HeroSide];
  result: string | null;
  potm: { name: string; line: string | null } | null;
  pills: string[];
  liveLine: string | null;
  venue: string | null;
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

/**
 * The match at a glance on the deep band: status pill and the page's h1 line, each side with its
 * colour bar, logo and display-size score, then the result and the Player of the Match, then the
 * facts ESPN notes (toss, series state, match number). Live matches carry the rate line instead of
 * a result; fixtures the ground.
 */
export function CricketMatchHero({ state, calledOff, headline, date, sides, result, potm, pills, liveLine, venue }: CricketMatchHeroProps) {
  const pill = state === "in" ? (
    <span className="pill pill-live"><span className="live-dot" />Live</span>
  ) : calledOff ? (
    <span className="pill pill-final">{calledOff}</span>
  ) : state === "post" ? (
    <span className="pill pill-final">Result</span>
  ) : (
    <span className="pill pill-upcoming">Upcoming</span>
  );
  return (
    <section className="band-deep relative flex flex-col gap-5 overflow-hidden rounded-2xl px-6 py-6" aria-label="Match summary">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="flex flex-wrap items-center gap-2">
          {pill}
          <h1 className="font-semibold text-[var(--mast-muted)]">{headline}</h1>
        </span>
        {date && <LocalTime iso={date} format={calledOff ? "date" : "datetime"} className="text-[var(--mast-muted)]" />}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {sides.map((side) => {
          const muted = state === "post" && !side.winner;
          const { main, detail } = splitCricketScore(side.score);
          return (
            <div key={side.name} className={`flex min-w-0 items-center gap-4 border-l-[6px] pl-4 ${muted ? "text-[var(--mast-muted)]" : ""}`} style={{ borderColor: side.colour ?? "var(--mast-line)" }}>
              <TeamLogo name={side.name} logoUrl={side.logo} size={52} priority />
              <div className="flex min-w-0 flex-col">
                <span className={`truncate text-[22px] leading-tight ${muted ? "font-bold" : "font-extrabold"}`}>{side.name}</span>
                {detail && <span className="text-[13px] text-[var(--mast-muted)]">{detail}</span>}
              </div>
              {main && <span className="display ml-auto shrink-0 text-[44px] leading-none tracking-tight tabular-nums sm:text-[56px]">{main}</span>}
            </div>
          );
        })}
      </div>

      {(result || liveLine || potm || venue) && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--mast-line)] pt-4">
          {result && <p className="m-0 text-[20px] font-bold text-[var(--sig)]">{result}</p>}
          {!result && liveLine && <p className="m-0 text-[15px] font-semibold">{liveLine}</p>}
          {!result && !liveLine && venue && <p className="m-0 text-[14px] text-[var(--mast-muted)]">{venue}</p>}
          {potm && (
            <span className="flex items-center gap-3">
              <span className="eyebrow text-[var(--mast-muted)]">Player of the Match</span>
              <span className="flex items-center gap-2.5 rounded-full bg-[var(--mast-line)] py-1.5 pl-1.5 pr-3.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--sig)] text-[12px] font-extrabold text-[var(--band-deep)]">{initials(potm.name)}</span>
                <span className="text-[14px] font-bold">{potm.name}</span>
                {potm.line && <span className="text-[14px] text-[var(--mast-muted)] tabular-nums">{potm.line}</span>}
              </span>
            </span>
          )}
        </div>
      )}

      {pills.length > 0 && (
        <ul className="m-0 flex list-none flex-wrap gap-2 p-0 text-[12px] text-[var(--mast-muted)]">
          {pills.map((p) => (
            <li key={p} className="rounded-full border border-[var(--mast-line)] px-2.5 py-1">{p}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
```

Note: inside `.band-deep`, `--sig` resolves to the band's link colour and `--mast-muted`/`--mast-line` to the band's muted text and hairline, so the component names only band tokens. The pill's text sits on the band, so the result line uses `--sig` as the spec says.

- [ ] **Step 4: Run the test to verify it passes**

Run: `env -u NODE_ENV npx tsx --test tests/cricket-match-hero-render.test.ts`
Expected: 3 pass. `LocalTime` is a client component; rendering it with `renderToStaticMarkup` in node works as the breadcrumbs test shows for other client components; if it reads `window`, pass `date: null` in the test and assert the date elsewhere.

- [ ] **Step 5: Commit**

```bash
git add src/components/CricketMatchHero.tsx tests/cricket-match-hero-render.test.ts
git commit -m "feat(cricket): band-deep match hero with team colours and display scores"
```

---

### Task 7: Wire the hero and the story into the match page

**Files:**
- Modify: `src/lib/cricketMatchPage.tsx` (the `<section className="card …">` hero block, lines ~137-150, and the imports; add the story fetch and section after `AdSlot`)
- Test: `tests/cricket-match-page-wiring.test.ts` (source-level, no database)

**Interfaces:**
- Consumes: everything above; `isSettledCricketMatch` from `cricketMatchCache`; `details.scorecard` for the Player of the Match's figures.

- [ ] **Step 1: Write the failing test**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync(new URL("../src/lib/cricketMatchPage.tsx", import.meta.url), "utf8");

test("the match page renders the hero and the story, keeps its h1 line, report and share tools, and asks for balls only on limited-overs matches", () => {
  assert.match(page, /<CricketMatchHero/);
  assert.match(page, /<CricketMatchStory/);
  assert.doesNotMatch(page, /<section className="card flex flex-col gap-3 px-5 py-5">/);
  assert.match(page, /\[matchName, description, seriesName\]\.filter\(Boolean\)\.join\(" · "\)/);
  assert.match(page, /cricketMatchReport\(/);
  assert.match(page, /<ImageActions/);
  assert.match(page, /limitedOvers/);
  assert.match(page, /fetchCricketBallByBall\(/);
  assert.match(page, /isSettledCricketMatch\(stored, summary\)/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `env -u NODE_ENV npx tsx --test tests/cricket-match-page-wiring.test.ts`
Expected: FAIL on the first assertion.

- [ ] **Step 3: Edit the page**

Imports to add:

```ts
import { CricketMatchHero } from "@/components/CricketMatchHero";
import { CricketMatchStory } from "@/components/CricketMatchStory";
import { deriveMatchStory, fetchCricketBallByBall } from "@/lib/cricketBalls";
import { matchPills, teamColours } from "@/lib/cricketMatchExtras";
```

After `const report = cricketMatchReport({...});` add:

```ts
  // The match story needs every ball; only limited-overs matches are asked (a first-class match is
  // 80+ pages), and only once ESPN lists any (an upcoming match has none).
  const limitedOvers = comp?.limitedOvers === true;
  const balls = summary && limitedOvers && state !== "pre" ? await fetchCricketBallByBall(id, stored?.series_espn_id ?? "8048", { settled: isSettledCricketMatch(stored, summary) }) : null;
  const story = balls ? deriveMatchStory(balls) : [];
  const colours = teamColours(summary);
  const colourById: Record<string, string> = {};
  if (home?.team?.id && colours.home) colourById[String(home.team.id)] = colours.home;
  if (away?.team?.id && colours.away) colourById[String(away.team.id)] = colours.away;
  const potmRow = potm ? details?.scorecard.flatMap((t) => t.battingRows).find((r) => r.name === potm) ?? null : null;
  const potmLine = potmRow ? `${potmRow.stats[0]}${/not out/i.test(potmRow.dismissal ?? "") ? "*" : ""} (${potmRow.stats[1]})` : null;
  const lastInnings = story.at(-1);
  const liveLine = live && lastInnings?.runRate != null ? `Run rate ${lastInnings.runRate.toFixed(2)}${lastInnings.requiredRunRate != null ? ` · required ${lastInnings.requiredRunRate.toFixed(2)}` : ""}` : null;
```

Replace the hero `<section className="card flex flex-col gap-3 px-5 py-5">…</section>` with:

```tsx
      <CricketMatchHero
        state={state === "in" ? "in" : state === "post" ? "post" : "pre"}
        calledOff={calledOff}
        headline={[matchName, description, seriesName].filter(Boolean).join(" · ")}
        date={date}
        sides={[
          { name: sides[0].name, score: sides[0].score, winner: sides[0].winner, logo: sides[0].logo, colour: colours.home },
          { name: sides[1].name, score: sides[1].score, winner: sides[1].winner, logo: sides[1].logo, colour: colours.away },
        ]}
        result={state === "post" && summaryText ? teamDisplayName(summaryText) : null}
        potm={potm ? { name: potm, line: potmLine } : null}
        pills={matchPills(summary?.notes)}
        liveLine={liveLine ?? (live && summaryText ? teamDisplayName(summaryText) : null)}
        venue={details?.venue ? venueWithCity(details.venue, details.city) : (stored?.venue ?? null)}
      />
      {report ? <p className="text-sm leading-relaxed">{report}</p> : null}
```

Delete the old `sideRow` helper (no longer used). After `<AdSlot label="Cricket live match top" />` add:

```tsx
      {story.length > 0 && <CricketMatchStory innings={story} colours={colourById} />}
```

Keep the `potm` and `venue` fallbacks that the old card showed when there was no report: they are now in the hero (`potm` chip, `venue` for fixtures), so drop the two `{!report && …}` paragraphs.

Check `CricketInningsRow.stats` order (`battingLabels` is `["R","B","4s","6s","SR"]` in `matchDetail.ts`), so `stats[0]` is runs and `stats[1]` balls. If the labels differ, index by `battingLabels.indexOf("R")` instead.

- [ ] **Step 4: Run the wiring test, then the full suite, types and lint**

```bash
env -u NODE_ENV npx tsx --test tests/cricket-match-page-wiring.test.ts
env -u NODE_ENV npx tsx --test tests/*.test.ts
npx next typegen && npx tsc --noEmit
npx eslint src tests
```

Expected: all pass (1910 + the new tests), no type errors, lint clean. `css-layers.test.ts` must still pass: no new CSS was added, only utilities.

- [ ] **Step 5: Commit**

```bash
git add src/lib/cricketMatchPage.tsx tests/cricket-match-page-wiring.test.ts
git commit -m "feat(cricket): match page opens with the hero and the match story"
```

---

### Task 8: Verify in the browser and open the PR

**Files:**
- Create (session root, not committed): `/Users/ps/Claude/sports-stats-site/run-dev-match-story.sh`, a `.claude/launch.json` entry `match-story` on port 3017.

- [ ] **Step 1: Start the dev server** with `preview_start {name: "match-story"}` (the wrapper runs `env -u NODE_ENV npx next dev -p 3017` inside `worktrees/match-story`, which reads `.env.local` for the local Postgres on 5433).

- [ ] **Step 2: Open `/cricket/matches/1529230`** (a finished T20I: ESPN serves its summary and play-by-play live). Check: the band-deep hero with both colour bars, 56px scores, the result line, the Player of the Match chip "Shreyas Iyer 102* (43)", the pills; the Match story card with the worm, 12 wicket circles, the legend; click "Runs per over"; click over 6 and over 14 in the chart; the inspector texts. `read_console_messages` for hydration warnings (there must be none: the server and client HTML are identical).

- [ ] **Step 3: Dark mode and phone width.** `resize_window {colorScheme: "dark"}` then reload; `resize_window {preset: "mobile"}`: the hero rows stack, the chart keeps its aspect, the inspector stacks. Screenshot each.

- [ ] **Step 4: Other states.** An upcoming match (the 2nd T20I, 1529231: hero shows Upcoming + venue, no story section, no ball fetch in the dev log); a first-class match from the series list (no story section); a match ESPN lists with no stored row still renders.

- [ ] **Step 5: Push and open the PR** via Claude in Chrome (the compare form; title "Cricket match page: hero and match story chart"; body from the spec's PR 1 scope, the verification list and `🤖 Generated with [Claude Code](https://claude.com/claude-code)`), confirm with the GitHub API, then `scratchpad/checks.py <sha>` after ~3 minutes. Do not merge: the owner merges on their say-so, and the merge deploys.
