/* eslint-disable @typescript-eslint/no-explicit-any -- fixtures shaped like raw ESPN JSON */
import { afterEach, test } from "node:test";
import assert from "node:assert/strict";

// scripts/lib/espn.ts is safe to import without a database.
import { fetchCricketSummary, fetchSummary, getJson } from "../scripts/lib/espn";
import { fetchMatchSummary } from "../src/lib/matchDetail";
import { CRICKET_FALLBACK_PATH, cricketSummaryPaths, fetchCricketSummaryVia, isCricketSummary } from "../src/lib/cricketSummary";

const BAD_GATEWAY = { code: 2502, detail: "http error: bad gateway" };
const GOOD = { header: { id: "1490430", competitions: [{ competitors: [{}, {}] }] }, rosters: [] };
const noLog = { backoffMs: 0, log: () => {} };

test("ESPN's 502 error body is not a summary; a header or rosters makes one", () => {
  assert.equal(isCricketSummary(BAD_GATEWAY), false);
  assert.equal(isCricketSummary({}), false);
  assert.equal(isCricketSummary(null), false);
  assert.equal(isCricketSummary("<html>"), false);
  assert.equal(isCricketSummary(GOOD), true);
  assert.equal(isCricketSummary({ rosters: [] }), true);
});

test("paths: the league's own, then the IPL's, never twice", () => {
  assert.deepEqual(cricketSummaryPaths("cricket/21282"), ["cricket/21282", CRICKET_FALLBACK_PATH]);
  assert.deepEqual(cricketSummaryPaths("cricket/8048"), ["cricket/8048"]);
  assert.deepEqual(cricketSummaryPaths(undefined), [CRICKET_FALLBACK_PATH]);
});

test("an error body on every path fails after retrying each path, logging the game id and the reason", async () => {
  const calls: string[] = [];
  const logged: string[] = [];
  await assert.rejects(
    fetchCricketSummaryVia(async (p) => (calls.push(p), BAD_GATEWAY), "1490430", ["cricket/8584", CRICKET_FALLBACK_PATH], { backoffMs: 0, log: (m) => logged.push(m) }),
    /1490430.*bad gateway/
  );
  // first try + 2 retries on each of the two paths
  assert.deepEqual(calls, ["cricket/8584", "cricket/8584", "cricket/8584", CRICKET_FALLBACK_PATH, CRICKET_FALLBACK_PATH, CRICKET_FALLBACK_PATH]);
  assert.equal(logged.length, 1);
  assert.match(logged[0], /1490430/);
  assert.match(logged[0], /bad gateway/);
});

test("a transient error body is retried on the same path and the good body returned", async () => {
  const calls: string[] = [];
  const bodies = [BAD_GATEWAY, GOOD];
  const got = await fetchCricketSummaryVia(async (p) => (calls.push(p), bodies.shift()), "1", ["cricket/8584", CRICKET_FALLBACK_PATH], noLog);
  assert.equal(got, GOOD);
  assert.deepEqual(calls, ["cricket/8584", "cricket/8584"]);
});

test("when the league's own path never gives a summary the IPL path is used", async () => {
  const got = await fetchCricketSummaryVia(async (p) => (p === CRICKET_FALLBACK_PATH ? GOOD : BAD_GATEWAY), "1", ["cricket/8584", CRICKET_FALLBACK_PATH], noLog);
  assert.equal(got, GOOD);
});

test("a thrown network error is retried like a bad body", async () => {
  let n = 0;
  const got = await fetchCricketSummaryVia(
    async () => {
      if (n++ === 0) throw new Error("socket hang up");
      return GOOD;
    },
    "1",
    ["cricket/8584"],
    noLog
  );
  assert.equal(got, GOOD);
});

test("a summary the caller finds unusable moves to the next path; the structural body is the last resort", async () => {
  const bare = { header: { competitions: [{ competitors: [] }] } };
  const full = { header: { competitions: [{ competitors: [{}] }] }, rosters: [{}] };
  const useful = (s: any) => Array.isArray(s.rosters) && s.rosters.length > 0;
  assert.equal(await fetchCricketSummaryVia(async (p) => (p === "a" ? bare : full), "1", ["a", "b"], { ...noLog, accept: useful }), full);
  // Nothing better anywhere: the valid-but-thin body comes back rather than a failure.
  assert.equal(await fetchCricketSummaryVia(async () => bare, "1", ["a", "b"], { ...noLog, accept: useful }), bare);
});

test("a deadline stops the retries: with ESPN slow and failing the read gives up after the attempt that crossed it", async () => {
  let t = 0;
  const calls: string[] = [];
  const logged: string[] = [];
  const clock = { now: () => t, sleep: async (ms: number) => void (t += ms) };
  await assert.rejects(
    fetchCricketSummaryVia(async (p) => (calls.push(p), (t += 3000), BAD_GATEWAY), "77", ["cricket/8584", CRICKET_FALLBACK_PATH], { backoffMs: 250, deadlineMs: 8000, log: (m) => logged.push(m), ...clock }),
    /77.*gave up after 8000 ms/
  );
  // 3s + 0.25s wait + 3s + 0.5s wait + 3s = 9.75s: the third attempt crosses 8s and nothing more is started
  assert.deepEqual(calls, ["cricket/8584", "cricket/8584", "cricket/8584"]);
  assert.equal(logged.length, 1);
  // and without a deadline the same ESPN gets all six attempts
  t = 0;
  calls.length = 0;
  await assert.rejects(fetchCricketSummaryVia(async (p) => (calls.push(p), (t += 3000), BAD_GATEWAY), "77", ["cricket/8584", CRICKET_FALLBACK_PATH], { backoffMs: 250, log: () => {}, ...clock }));
  assert.equal(calls.length, 6);
});

test("a deadline does not stop a read that is succeeding", async () => {
  let t = 0;
  const got = await fetchCricketSummaryVia(async () => ((t += 100), GOOD), "1", ["a"], { deadlineMs: 8000, now: () => t, sleep: async () => {}, log: () => {} });
  assert.equal(got, GOOD);
});

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});
function stubFetch(handler: (url: string) => { status: number; body: unknown }) {
  const urls: string[] = [];
  globalThis.fetch = (async (input: any) => {
    const url = String(input);
    urls.push(url);
    const { status, body } = handler(url);
    return new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
  }) as typeof fetch;
  return urls;
}

test("fetchSummary for a cricket league rejects the 502 body and falls back to the IPL path", async () => {
  const urls = stubFetch((url) => (url.includes("/cricket/8048/") ? { status: 200, body: GOOD } : { status: 502, body: BAD_GATEWAY }));
  const got = await fetchSummary("wcwc", "1490430", noLog);
  assert.deepEqual(got, GOOD);
  assert.equal(urls.filter((u) => u.includes("/cricket/8584/")).length, 3);
  assert.equal(urls.filter((u) => u.includes("/cricket/8048/")).length, 1);
});

test("fetchSummary for a cricket league still trusts a complete body served with a 502 status", async () => {
  const urls = stubFetch(() => ({ status: 502, body: GOOD }));
  assert.deepEqual(await fetchSummary("wpl", "1", noLog), GOOD);
  assert.equal(urls.length, 1);
});

test("fetchCricketSummary reads any cricket event through explicit paths (internationals have no league path)", async () => {
  const urls = stubFetch(() => ({ status: 200, body: GOOD }));
  await fetchCricketSummary("1549195", [CRICKET_FALLBACK_PATH], noLog);
  assert.deepEqual(urls, ["https://site.api.espn.com/apis/site/v2/sports/cricket/8048/summary?event=1549195"]);
});

test("other sports are unchanged: fetchSummary and getJson return whatever parses, one request, no retry", async () => {
  const urls = stubFetch(() => ({ status: 502, body: BAD_GATEWAY }));
  assert.deepEqual(await fetchSummary("nba", "401"), BAD_GATEWAY);
  assert.deepEqual(await getJson("https://example.test/x"), BAD_GATEWAY);
  assert.equal(urls.length, 2);
  stubFetch(() => ({ status: 502, body: "<html>bad gateway</html>" }));
  await assert.rejects(fetchSummary("epl", "1"), /ESPN request failed \(502\)/);
});

test("the match page's live fallback rejects the 502 body, retries and reads the IPL path (cricket)", async () => {
  const urls = stubFetch((url) => (url.includes("/cricket/8048/") ? { status: 200, body: GOOD } : { status: 502, body: BAD_GATEWAY }));
  assert.deepEqual(await fetchMatchSummary("wcwc", "1490430"), GOOD);
  assert.equal(urls.filter((u) => u.includes("/cricket/8584/")).length, 3);
});

test("the match page's live fallback gives up with null (and a logged reason) when ESPN only ever answers with the error body", async () => {
  const errors: string[] = [];
  const realError = console.error;
  console.error = (...a: unknown[]) => void errors.push(a.join(" "));
  try {
    stubFetch(() => ({ status: 502, body: BAD_GATEWAY }));
    assert.equal(await fetchMatchSummary("wpl", "1490999"), null);
  } finally {
    console.error = realError;
  }
  assert.equal(errors.length, 1);
  assert.match(errors[0], /1490999.*bad gateway/);
});

test("the match page's live fallback is unchanged for other sports: one request, no retry, null on a non-2xx status", async () => {
  const urls = stubFetch(() => ({ status: 502, body: BAD_GATEWAY }));
  assert.equal(await fetchMatchSummary("nba", "401"), null);
  assert.equal(urls.length, 1);
  stubFetch(() => ({ status: 200, body: { boxscore: {} } }));
  assert.deepEqual(await fetchMatchSummary("epl", "1"), { boxscore: {} });
});
