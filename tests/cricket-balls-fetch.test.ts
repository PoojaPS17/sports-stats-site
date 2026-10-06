import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchCricketBallByBall, BALL_PAGE_CAP, playByPlayUrl } from "../src/lib/cricketBalls";

const page = (index: number, count: number, pageCount: number) => ({
  commentary: { count, pageIndex: index, pageSize: 25, pageCount, items: Array.from({ length: Math.max(0, Math.min(25, count - (index - 1) * 25)) }, (_, i) => ({ id: `${index}-${i}` })) },
});

function recorder(pages: Record<number, unknown>) {
  const calls: { page: number; revalidate: number }[] = [];
  const fetchJson = async (url: string, revalidate: number) => {
    const n = Number(new URL(url).searchParams.get("page"));
    calls.push({ page: n, revalidate });
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
  assert.deepEqual(r.calls, [
    { page: 1, revalidate: 10 },
    { page: 2, revalidate: 86400 },
    { page: 3, revalidate: 10 },
  ]);
});

test("a settled match reads every page with the long window", async () => {
  const r = recorder({ 1: page(1, 30, 2), 2: page(2, 30, 2) });
  await fetchCricketBallByBall("1529230", "8669", { settled: true, fetchJson: r.fetchJson });
  assert.deepEqual(
    r.calls.map((c) => c.revalidate),
    [86400, 86400]
  );
});

test("an upcoming match has no pages and gives an empty list after one read", async () => {
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
