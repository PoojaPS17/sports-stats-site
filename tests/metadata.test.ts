import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pageMeta } from "../src/lib/metadata";
import { absoluteUrl } from "../src/lib/site";

// The root layout sets the robots hint (max-image-preview, max-snippet). Next shallow-merges
// metadata, so a page that returns any `robots` value, or none, replaces the root's whole object:
// pageMeta must therefore always carry the full directive itself.
const INDEXABLE = { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 } };

test("an indexable page carries the full robots directive", () => {
  assert.deepEqual(pageMeta("T", "D", "/nba").robots, INDEXABLE);
  assert.deepEqual(pageMeta("T", "D", "/nba", { noindex: false }).robots, INDEXABLE);
  assert.deepEqual(pageMeta("T", "D").robots, INDEXABLE);
  assert.deepEqual(pageMeta("T", "D", "/nba", { ownImage: true }).robots, INDEXABLE);
});

test("a noindex page stays noindex, follow", () => {
  assert.deepEqual(pageMeta("T", "D", "/nba", { noindex: true }).robots, { index: false, follow: true });
  assert.deepEqual(pageMeta("T", "D", undefined, { noindex: true }).robots, { index: false, follow: true });
});

// Every page whose data can be empty passes a condition, not a literal; both branches must work.
test("noindex follows the flag it is given", () => {
  for (const empty of [true, false]) {
    const robots = pageMeta("T", "D", "/nba/players/x", { noindex: empty }).robots as { index: boolean };
    assert.equal(robots.index, !empty);
  }
});

// Canonicals. Next drops a parent's `alternates` whenever a child sets its own, and inherits it when a
// child sets none, so a canonical in the root layout would land on every page that forgot its own.
// pageMeta is where each page gets one: from its path, absolute, and matching og:url.
test("a path gives an absolute canonical that matches og:url", () => {
  for (const path of ["/", "/nba", "/nba/players", "/epl/teams/arsenal/2025", "/nba/week"]) {
    const m = pageMeta("T", "D", path);
    assert.deepEqual(m.alternates, { canonical: absoluteUrl(path) }, path);
    assert.equal((m.openGraph as { url?: string }).url, absoluteUrl(path), path);
  }
});

test("no path gives no canonical (a page that omits it is a page with none)", () => {
  for (const options of [undefined, { noindex: true }, { ownImage: true }]) {
    const m = pageMeta("T", "D", undefined, options);
    assert.equal(m.alternates, undefined);
    assert.equal((m.openGraph as { url?: string }).url, undefined);
  }
});

test("the root layout sets no canonical, so none can be inherited by mistake", () => {
  const layout = readFileSync(new URL("../src/app/layout.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(layout, /alternates|canonical/);
});

test("the home page carries its own canonical", async () => {
  const { metadata } = await import("../src/app/page");
  assert.deepEqual(metadata.alternates, { canonical: absoluteUrl("/") });
});

test("the players index of every league is canonical to itself", async () => {
  const { generateMetadata } = await import("../src/app/[league]/players/page");
  for (const league of ["nba", "nfl", "epl", "ucl", "ipl"]) {
    const m = await generateMetadata({ params: Promise.resolve({ league }) });
    assert.deepEqual(m.alternates, { canonical: absoluteUrl(`/${league}/players`) }, league);
  }
});
