import { test } from "node:test";
import assert from "node:assert/strict";

// Every page with a dynamic segment has to say it is cacheable. In this Next version a dynamic
// route without `generateStaticParams` is rendered on demand on every request and answers
// `cache-control: private, no-cache, no-store`, so `revalidate` is never honoured and neither the
// ISR cache nor Cloudflare can hold the page (node_modules/next/dist/docs/01-app/03-api-reference/
// 04-functions/generate-static-params.md, "All paths at runtime": "You must always return an array
// from generateStaticParams, even if it's empty. Otherwise, the route will be dynamically
// rendered."). An empty array builds nothing up front: the first request renders the page and every
// request after it is served from the cache until `revalidate` seconds have passed.
//
// The revalidate figures below are the ones the pages had before this was added. They are listed
// here so that changing one is a deliberate act with a failing test behind it, not a side effect.
const CACHEABLE: { module: string; revalidate: number }[] = [
  { module: "../src/app/[league]/games/[id]/page", revalidate: 10 },
  { module: "../src/app/[league]/games/[id]/opengraph-image", revalidate: 300 },
  { module: "../src/app/[league]/h2h/[pair]/page", revalidate: 600 },
  { module: "../src/app/[league]/matchweek/[n]/page", revalidate: 300 },
  { module: "../src/app/[league]/matchweek/[n]/[week]/page", revalidate: 86400 },
  { module: "../src/app/[league]/players/[slug]/page", revalidate: 300 },
  { module: "../src/app/[league]/players/[slug]/[season]/page", revalidate: 86400 },
  { module: "../src/app/[league]/scores/[date]/page", revalidate: 15 },
  { module: "../src/app/[league]/standings/[season]/page", revalidate: 300 },
  { module: "../src/app/[league]/teams/[slug]/page", revalidate: 300 },
  { module: "../src/app/[league]/teams/[slug]/[season]/page", revalidate: 86400 },
  { module: "../src/app/[league]/teams/[slug]/about/page", revalidate: 86400 },
  { module: "../src/app/[league]/teams/[slug]/history/page", revalidate: 3600 },
  { module: "../src/app/[league]/teams/[slug]/opengraph-image", revalidate: 86400 },
  { module: "../src/app/cricket/matches/[id]/page", revalidate: 10 },
  { module: "../src/app/cricket/series/[id]/page", revalidate: 15 },
  { module: "../src/app/f1/drivers/[slug]/page", revalidate: 300 },
  { module: "../src/app/f1/events/[id]/page", revalidate: 300 },
  { module: "../src/app/f1/teams/[slug]/page", revalidate: 300 },
  { module: "../src/app/tennis/[tour]/players/[slug]/page", revalidate: 300 },
  { module: "../src/app/tennis/scores/[date]/page", revalidate: 15 },
  { module: "../src/app/tennis/tournaments/[id]/page", revalidate: 300 },
];

// The two segments whose every value is known up front name them all, so those pages are built at
// deploy time rather than on first request.
const ENUMERATED = ["../src/app/[league]/layout", "../src/app/tennis/[tour]/layout"];

for (const { module: path, revalidate } of CACHEABLE) {
  const route = path.replace("../src/app", "").replace(/\/(page|opengraph-image)$/, (_m, m1) => (m1 === "page" ? "" : "/opengraph-image")) || "/";

  test(`${route} is cacheable and keeps revalidate = ${revalidate}`, async () => {
    const mod = (await import(path)) as Record<string, unknown>;

    assert.equal(typeof mod.generateStaticParams, "function", `${route} exports generateStaticParams`);
    const params = await (mod.generateStaticParams as () => unknown)();
    assert.ok(Array.isArray(params), `${route} returns an array from generateStaticParams`);

    assert.equal(mod.revalidate, revalidate, `${route} still revalidates every ${revalidate}s`);

    // Left at its default so a slug that was never built still renders on demand and 404s through
    // notFound(), exactly as it does today.
    assert.equal(mod.dynamicParams, undefined, `${route} leaves dynamicParams at its default`);
  });
}

for (const path of ENUMERATED) {
  test(`${path.replace("../src/app", "")} names its segment's values`, async () => {
    const mod = (await import(path)) as Record<string, unknown>;
    assert.equal(typeof mod.generateStaticParams, "function");
    const params = await (mod.generateStaticParams as () => unknown)();
    assert.ok(Array.isArray(params) && params.length > 0);
  });
}

// The player page must not read searchParams: one read makes every player page in every league
// render on demand. The cricket split it used to read is a tab in the page now.
test("the player page does not read searchParams", async () => {
  const { readFileSync } = await import("node:fs");
  const source = readFileSync(new URL("../src/app/[league]/players/[slug]/page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /searchParams/, "the player page renders from params alone");
});
