// Regression coverage for the general logo-validity safety net (verifyLogoUrl): whatever a
// caller passes in — a curated substitute, a raw DB value, or an id nobody has checked yet —
// must never reach @vercel/og's server-side <img> fetch unless it's confirmed to be a real,
// reachable image. A dead URL there throws "Unsupported image type: unknown" and crashes the
// share-image route, so every non-image outcome (404, non-image body, network failure) must
// resolve to null rather than pass the candidate URL through.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { verifyLogoUrl } from "../src/lib/verifyImageUrl";

function withFetch<T>(impl: typeof fetch, fn: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = impl;
  return fn().finally(() => {
    globalThis.fetch = original;
  });
}

test("verifyLogoUrl passes through a URL that resolves to a real image", async () => {
  const url = "https://a.espncdn.com/i/teamlogos/cricket/500/6.png";
  const fetchMock = mock.fn(async () => new Response(null, { status: 200, headers: { "content-type": "image/png" } }));
  const result = await withFetch(fetchMock as unknown as typeof fetch, () => verifyLogoUrl(url));
  assert.equal(result, url);
  assert.equal(fetchMock.mock.callCount(), 1);
});

test("verifyLogoUrl blanks a URL that 404s", async () => {
  const fetchMock = mock.fn(async () => new Response(null, { status: 404 }));
  const result = await withFetch(fetchMock as unknown as typeof fetch, () => verifyLogoUrl("https://a.espncdn.com/i/teamlogos/cricket/500/68.png"));
  assert.equal(result, null);
});

test("verifyLogoUrl blanks a URL that returns a non-image body even with a 200", async () => {
  const fetchMock = mock.fn(async () => new Response("<html>not found</html>", { status: 200, headers: { "content-type": "text/html" } }));
  const result = await withFetch(fetchMock as unknown as typeof fetch, () => verifyLogoUrl("https://a.espncdn.com/i/teamlogos/cricket/500/68.png"));
  assert.equal(result, null);
});

test("verifyLogoUrl blanks a URL when the fetch itself fails or times out", async () => {
  const fetchMock = mock.fn(async () => {
    throw new Error("network error");
  });
  const result = await withFetch(fetchMock as unknown as typeof fetch, () => verifyLogoUrl("https://a.espncdn.com/i/teamlogos/cricket/500/68.png"));
  assert.equal(result, null);
});

test("verifyLogoUrl passes null through without calling fetch", async () => {
  const fetchMock = mock.fn(async () => new Response(null, { status: 200 }));
  const result = await withFetch(fetchMock as unknown as typeof fetch, () => verifyLogoUrl(null));
  assert.equal(result, null);
  assert.equal(fetchMock.mock.callCount(), 0);
});
