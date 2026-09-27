import { test } from "node:test";
import assert from "node:assert/strict";
import { INDEXNOW_KEY, INDEXNOW_MAX_URLS, indexNowBatches, submitToIndexNow } from "../src/lib/indexnow";

// IndexNow tells Bing (and Yandex, Seznam, Naver -- not Google) that a URL is new or has
// changed, instead of waiting for a crawl to find it. The protocol caps a request at 10,000
// URLs and requires every URL to be on the host being claimed, so a bad batch is rejected
// whole. Submitting URLs that did not actually change is what gets a site throttled, so the
// callers send newly created pages only.

const ORIGIN = "https://sports-db.live";
const KEY = "testkey123";

test("a batch names the host, the key and where the key file lives", () => {
  const [batch] = indexNowBatches([`${ORIGIN}/epl`], ORIGIN, KEY);

  assert.deepEqual(batch, {
    host: "sports-db.live",
    key: KEY,
    keyLocation: `${ORIGIN}/${KEY}.txt`,
    urlList: [`${ORIGIN}/epl`],
  });
});

test("more URLs than the protocol allows are split across requests", () => {
  const urls = Array.from({ length: INDEXNOW_MAX_URLS + 5 }, (_, i) => `${ORIGIN}/epl/games/${i}`);

  const batches = indexNowBatches(urls, ORIGIN, KEY);

  assert.equal(batches.length, 2);
  assert.equal(batches[0].urlList.length, INDEXNOW_MAX_URLS);
  assert.equal(batches[1].urlList.length, 5);
});

test("duplicates are collapsed and URLs on another host are dropped", () => {
  const [batch] = indexNowBatches([`${ORIGIN}/epl`, `${ORIGIN}/epl`, "https://example.com/epl"], ORIGIN, KEY);

  assert.deepEqual(batch.urlList, [`${ORIGIN}/epl`]);
});

// The scrape scripts run outside the Next build, where NEXT_PUBLIC_SITE_URL is usually
// unset and SITE_URL falls back to the review copy. Claiming that host would announce
// vercel.app URLs to Bing, so the default is the one host that is ever indexable.
test("by default a batch claims the live host, whatever SITE_URL resolved to", () => {
  const [batch] = indexNowBatches(["https://sports-db.live/epl"]);

  assert.equal(batch.host, "sports-db.live");
  assert.equal(batch.keyLocation, `https://sports-db.live/${INDEXNOW_KEY}.txt`);
});

test("nothing to submit means no request at all", async () => {
  let calls = 0;
  const result = await submitToIndexNow([], { origin: ORIGIN, key: KEY, sleepImpl: async () => {}, fetchImpl: async () => { calls++; return new Response("", { status: 200 }); } });

  assert.equal(calls, 0);
  assert.deepEqual(result, { batches: 0, submitted: 0, failed: 0, refusals: [] });
});

test("a submission posts JSON to the IndexNow endpoint", async () => {
  const seen: { url: string; body: unknown }[] = [];
  const fetchImpl = async (url: string | URL, init?: RequestInit) => {
    seen.push({ url: String(url), body: JSON.parse(String(init?.body)) });
    return new Response("", { status: 200 });
  };

  const result = await submitToIndexNow([`${ORIGIN}/epl`], { origin: ORIGIN, key: KEY, sleepImpl: async () => {}, fetchImpl });

  assert.equal(seen.length, 1);
  assert.match(seen[0].url, /api\.indexnow\.org/);
  assert.deepEqual((seen[0].body as { urlList: string[] }).urlList, [`${ORIGIN}/epl`]);
  assert.deepEqual(result, { batches: 1, submitted: 1, failed: 0, refusals: [] });
});

// A scrape must not die because a search engine had a bad minute.
test("an endpoint that fails is reported, not thrown", async () => {
  const result = await submitToIndexNow([`${ORIGIN}/epl`], {
    origin: ORIGIN,
    key: KEY,
    sleepImpl: async () => {},
    fetchImpl: async () => { throw new Error("connection reset"); },
  });

  assert.deepEqual(result, { batches: 1, submitted: 0, failed: 1, refusals: ["connection reset"] });
});

test("a rejection status counts as failed rather than submitted", async () => {
  const result = await submitToIndexNow([`${ORIGIN}/epl`], {
    origin: ORIGIN,
    key: KEY,
    sleepImpl: async () => {},
    fetchImpl: async () => new Response("", { status: 422 }),
  });

  assert.deepEqual(result, { batches: 1, submitted: 0, failed: 1, refusals: ["422"] });
});

// Ownership is proved by serving the key back at /<key>.txt. Rotating INDEXNOW_KEY without
// renaming the file would leave every submission rejected, and nothing else would notice.
test("the key file published at the site root matches the key in use", async () => {
  const { readFileSync } = await import("node:fs");
  const { join } = await import("node:path");

  const file = join(import.meta.dirname, "..", "public", `${INDEXNOW_KEY}.txt`);

  assert.equal(readFileSync(file, "utf8").trim(), INDEXNOW_KEY);
});

// The first real bootstrap sent 15 bulk requests back to back and had 7 refused: the
// endpoint throttles a burst, and the submission reported only a count, so there was no
// way to see why. Batches are now paced and a refusal is retried before being given up on.

test("a batch refused once is retried and then counts as submitted", async () => {
  let calls = 0;
  const result = await submitToIndexNow([`${ORIGIN}/epl`], {
    origin: ORIGIN,
    key: KEY,
    sleepImpl: async () => {},
    fetchImpl: async () => new Response("", { status: ++calls === 1 ? 429 : 200 }),
  });

  assert.equal(calls, 2);
  assert.deepEqual({ batches: result.batches, submitted: result.submitted, failed: result.failed }, { batches: 1, submitted: 1, failed: 0 });
});

test("a batch refused every time is given up on and reports the status", async () => {
  const result = await submitToIndexNow([`${ORIGIN}/epl`], {
    origin: ORIGIN,
    key: KEY,
    retries: 2,
    sleepImpl: async () => {},
    fetchImpl: async () => new Response("", { status: 429 }),
  });

  assert.equal(result.failed, 1);
  assert.equal(result.submitted, 0);
  assert.deepEqual(result.refusals, ["429"]);
});

test("requests are paced so a burst is not what gets the site throttled", async () => {
  const waits: number[] = [];
  const urls = Array.from({ length: INDEXNOW_MAX_URLS * 2 }, (_, i) => `${ORIGIN}/g/${i}`);

  await submitToIndexNow(urls, {
    origin: ORIGIN,
    key: KEY,
    sleepImpl: async (ms) => { waits.push(ms); },
    fetchImpl: async () => new Response("", { status: 200 }),
  });

  assert.equal(waits.length, 1, "one pause between the two batches, none after the last");
  assert.ok(waits[0] > 0, "the pause should actually be a pause");
});
