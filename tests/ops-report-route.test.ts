import { test } from "node:test";
import assert from "node:assert/strict";
import type { OpsReport } from "../src/lib/opsReport";

// The route never reaches Postgres here: resetOpsReportMemo swaps the computation for this stub, so
// the test asserts the route's own contract (the cache header, the shape, the memo) and nothing else.
const SECTION_KEYS = [
  "build", "heartbeats", "freshness", "volume", "duplicates",
  "scraping", "integrity", "backup", "dbHealth", "views",
] as const;

function stubReport(): OpsReport {
  const section = { ok: true as const, data: null };
  return {
    generatedAt: "2026-09-29T00:00:00.000Z",
    ...Object.fromEntries(SECTION_KEYS.map((k) => [k, section])),
  } as unknown as OpsReport;
}

async function load() {
  const mod = await import("../src/app/api/ops/report/route");
  let calls = 0;
  mod.resetOpsReportMemo(async () => {
    calls += 1;
    return stubReport();
  });
  return { GET: mod.GET, reset: mod.resetOpsReportMemo, calls: () => calls };
}

test("the report answers with the edge cache header the plan fixed, and every section", async () => {
  const { GET, reset, calls } = await load();
  const res = await GET(new Request("https://sports-db.live/api/ops/report"));
  assert.equal(res.headers.get("Cache-Control"), "public, s-maxage=900, stale-while-revalidate=60");
  const body = (await res.json()) as Record<string, unknown>;
  assert.equal(typeof body.generatedAt, "string");
  for (const key of SECTION_KEYS) assert.ok(body[key], `section ${key}`);
  assert.equal(calls(), 1);
  reset();
});

test("cache-busting query strings cannot make the origin recompute", async () => {
  const { GET, reset, calls } = await load();
  const first = await GET(new Request("https://sports-db.live/api/ops/report?x=1"));
  const second = await GET(new Request("https://sports-db.live/api/ops/report?x=2"));
  assert.equal(calls(), 1, "the second request is served from the in-process memo");
  assert.deepEqual(await first.json(), await second.json());
  reset();
});

test("two requests that arrive together share one in-flight computation", async () => {
  const mod = await import("../src/app/api/ops/report/route");
  let calls = 0;
  let release: (() => void) | null = null;
  mod.resetOpsReportMemo(async () => {
    calls += 1;
    await new Promise<void>((done) => {
      release = done;
    });
    return stubReport();
  });
  const a = mod.GET(new Request("https://sports-db.live/api/ops/report?x=1"));
  const b = mod.GET(new Request("https://sports-db.live/api/ops/report?x=2"));
  await new Promise((done) => setTimeout(done, 0));
  assert.equal(calls, 1, "the second request joins the first computation instead of starting one");
  release!();
  assert.equal((await a).status, 200);
  assert.equal((await b).status, 200);
  mod.resetOpsReportMemo();
});
