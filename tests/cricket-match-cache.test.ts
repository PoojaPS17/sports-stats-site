import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { FINISHED_MATCH_REVALIDATE, isSettledCricketMatch, isStoredFinalMatch } from "../src/lib/cricketMatchCache";
import { fetchCricketSummaryLive, LIVE_REVALIDATE } from "../src/lib/cricketLive";

const summary = JSON.parse(readFileSync(fileURLToPath(new URL("./fixtures/espn-cricket-summary-1553790.json", import.meta.url)), "utf8"));
const post = { status_state: "post", status_summary: "Match drawn" };

function withStatus(state: string, text: string, scores?: string[]) {
  const comp = summary.header.competitions[0];
  const competitors = scores ? comp.competitors.map((c: Record<string, unknown>, i: number) => ({ ...c, score: scores[i] })) : comp.competitors;
  return { ...summary, header: { ...summary.header, competitions: [{ ...comp, competitors, status: { ...comp.status, summary: text, type: { ...comp.status.type, state } } }] } };
}

test("a stored result whose summary is final with a scorecard is settled", () => {
  assert.equal(isSettledCricketMatch(post, summary), true);
});

test("a match the scrape still lists as in play or to come is not settled, whatever ESPN says now", () => {
  assert.equal(isSettledCricketMatch({ status_state: "in", status_summary: null }, summary), false);
  assert.equal(isSettledCricketMatch({ status_state: "pre", status_summary: null }, summary), false);
  assert.equal(isSettledCricketMatch(null, summary), false);
});

test("a stored result whose live summary is not final yet is not settled", () => {
  assert.equal(isSettledCricketMatch(post, withStatus("in", "Day 4 - Session 2")), false);
});

test("a final summary missing a side's total is not settled unless the match was never played", () => {
  assert.equal(isSettledCricketMatch(post, withStatus("post", "Match drawn", ["344", ""])), false);
  assert.equal(isSettledCricketMatch(post, withStatus("post", "Match abandoned without a ball bowled", ["", ""])), true);
  assert.equal(isSettledCricketMatch({ status_state: "post", status_summary: "Match cancelled without a ball bowled" }, withStatus("post", "Match cancelled without a ball bowled", ["", ""])), true);
});

// fetchCricketSummaryLive's cache options, seen by a stubbed fetch.
async function captureFetch(run: () => Promise<unknown>, onUrl?: (url: string) => void): Promise<RequestInit & { next?: { revalidate?: number } }> {
  const real = globalThis.fetch;
  let init: RequestInit | undefined;
  globalThis.fetch = (async (url: string | URL | Request, i?: RequestInit) => {
    onUrl?.(String(url));
    init = i;
    return new Response(JSON.stringify(summary), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  try {
    await run();
  } finally {
    globalThis.fetch = real;
  }
  assert.ok(init, "fetch was called");
  return init as RequestInit & { next?: { revalidate?: number } };
}

test("the summary is read with the live window by default", async () => {
  const init = await captureFetch(() => fetchCricketSummaryLive("1553790", "8836"));
  assert.equal(init.next?.revalidate, LIVE_REVALIDATE);
  assert.equal(init.cache, undefined);
});

test("a finished match's summary can be kept for the finished-match window", async () => {
  const init = await captureFetch(() => fetchCricketSummaryLive("1553790", "8836", { revalidate: FINISHED_MATCH_REVALIDATE }));
  assert.equal(init.next?.revalidate, FINISHED_MATCH_REVALIDATE);
});

test("a second attempt reads from its own address with the live window, so a bad day copy is retried every 10 seconds", async () => {
  let url = "";
  const init = await captureFetch(() => fetchCricketSummaryLive("1553790", "8836", { attempt: 2 }), (u) => void (url = u));
  assert.equal(init.next?.revalidate, LIVE_REVALIDATE);
  assert.match(url, /event=1553790&attempt=2$/);
});

// The proxy's view of a match: the stored row alone (ESPN is not consulted per request).
const stored = (over: Partial<{ status_state: string | null; status_summary: string | null; home: { score: string | null } | null; away: { score: string | null } | null }>) => ({
  status_state: "post",
  status_summary: "Match drawn",
  home: { score: "344" },
  away: { score: "643/8d & 167/3 (24.5 ov)" },
  ...over,
});

test("a stored row is final when it says post and both sides have a total", () => {
  assert.equal(isStoredFinalMatch(stored({})), true);
  assert.equal(isStoredFinalMatch(stored({ status_state: "in" })), false);
  assert.equal(isStoredFinalMatch(stored({ status_state: "pre", home: { score: null }, away: { score: null } })), false);
  assert.equal(isStoredFinalMatch(stored({ away: { score: "" } })), false);
  assert.equal(isStoredFinalMatch(stored({ away: null })), false);
  assert.equal(isStoredFinalMatch(null), false);
});

test("a stored row closed without play is final with no totals", () => {
  const none = { home: { score: null }, away: { score: null } };
  assert.equal(isStoredFinalMatch(stored({ ...none, status_summary: "Match abandoned without a ball bowled" })), true);
  assert.equal(isStoredFinalMatch(stored({ ...none, status_summary: "Match postponed" })), true);
  assert.equal(isStoredFinalMatch(stored({ ...none, status_summary: "Match suspended" })), false, "a suspended match may resume");
});

test("the public match route stays dynamic and the final route is the cached one", () => {
  const read = (rel: string) => readFileSync(fileURLToPath(new URL(`../src/app/cricket/matches/${rel}`, import.meta.url)), "utf8");
  const live = read("[id]/page.tsx");
  assert.match(live, /^export const revalidate = 10;$/m);
  assert.doesNotMatch(live, /^export function generateStaticParams/m, "the public route renders per request: a match in play must never be cached");
  assert.match(live, /mode="live"/);
  const final = read("final/[id]/page.tsx");
  assert.match(final, /^export const revalidate = 86400;$/m, "the finished-match window, as a literal for static-params.test.ts");
  assert.match(final, /^export function generateStaticParams\(\) \{\s*return \[\];\s*\}/m, "without this export no render is ever cached");
  assert.match(final, /mode="final"/);
  const shared = readFileSync(fileURLToPath(new URL("../src/lib/cricketMatchPage.tsx", import.meta.url)), "utf8");
  assert.match(shared, /revalidate: FINISHED_MATCH_REVALIDATE/, "a settled match's summary is read with the day window");
  assert.match(shared, /isSettledCricketMatch\(/);
  assert.match(shared, /attempt: 2/, "a day copy that is not final is replaced by a second read kept 10 seconds");
  assert.doesNotMatch(shared, /connection\(\)/, "a dynamic API in an on-demand static render is a 500 in this Next version, not a fallback");
});
