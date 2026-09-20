import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

// Whether a page with a dynamic segment is cached at all is decided by one export. From
// node_modules/next/dist/docs/01-app/03-api-reference/04-functions/generate-static-params.md ("All
// paths at runtime"): "You must always return an array from generateStaticParams, even if it's
// empty. Otherwise, the route will be dynamically rendered." A route without it is rendered again
// on every request and answers `private, no-cache, no-store`, so its `revalidate` never applies.
//
// This file walks src/app rather than listing routes by hand, so a new page cannot quietly miss the
// export — and, just as important, a page that must stay dynamic cannot quietly gain it.

const APP = fileURLToPath(new URL("../src/app/", import.meta.url));
const CONFIG = fileURLToPath(new URL("../next.config.ts", import.meta.url));

/** The site-wide cap on how old a cached response may be, from next.config.ts. */
function expireTime(): number {
  const m = readFileSync(CONFIG, "utf8").match(/^\s*expireTime:\s*(\d+),/m);
  assert.ok(m, "next.config.ts sets expireTime");
  return Number(m[1]);
}

// Reasons a route module under a dynamic segment is allowed to have no generateStaticParams.
// Anything not listed here must have one.
const DYNAMIC_ON_PURPOSE: Record<string, string> = {
  "[league]/games/[id]/page.tsx": "live match state; a cached copy can be any age and ships no LiveRefresh timer",
  "[league]/games/[id]/opengraph-image.tsx": "draws the live score",
  "[league]/scores/[date]/page.tsx": "today's scores are live",
  "cricket/matches/[id]/page.tsx": "live match state",
  "cricket/series/[id]/page.tsx": "live overlay decides which matches are in play",
  "tennis/scores/[date]/page.tsx": "today's scores are live",
  "calendar/[league]/route.ts": "reads ?download from the request",
  "calendar/[league]/[slug]/route.ts": "reads ?download from the request",
};

// The two routes whose figures cannot go out of date, so the five-minute cap does not apply.
const LONG_LIVED: Record<string, string> = {
  "[league]/teams/[slug]/about/page.tsx": "home venue, city and head coach only",
  "[league]/teams/[slug]/opengraph-image.tsx": "crest, club name and competition label only",
};

// The exact window each cached route keeps. Listed so that changing one is deliberate and the
// change shows up in a diff with a failing test behind it.
const REVALIDATE: Record<string, number> = {
  "[league]/h2h/[pair]/page.tsx": 300,
  "[league]/matchweek/[n]/page.tsx": 300,
  "[league]/matchweek/[n]/[week]/page.tsx": 300,
  "[league]/players/[slug]/page.tsx": 300,
  "[league]/players/[slug]/[season]/page.tsx": 300,
  "[league]/standings/[season]/page.tsx": 300,
  "[league]/teams/[slug]/page.tsx": 300,
  "[league]/teams/[slug]/[season]/page.tsx": 300,
  "[league]/teams/[slug]/about/page.tsx": 86400,
  "[league]/teams/[slug]/history/page.tsx": 300,
  "[league]/teams/[slug]/opengraph-image.tsx": 86400,
  "f1/drivers/[slug]/page.tsx": 300,
  "f1/events/[id]/page.tsx": 300,
  "f1/teams/[slug]/page.tsx": 300,
  "tennis/[tour]/players/[slug]/page.tsx": 300,
  "tennis/tournaments/[id]/page.tsx": 300,
};

const ROUTE_FILE = /^(page|route|opengraph-image)\.(tsx|ts)$/;
const LAYOUT_FILE = /^layout\.(tsx|ts)$/;

/** Source with comments removed, so a word in a note is never mistaken for a call. */
function code(file: string): string {
  return readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const hasStaticParams = (src: string) => /^export (?:async )?function generateStaticParams\b/m.test(src);
const revalidateOf = (src: string) => {
  const m = src.match(/^export const revalidate = (\d+);$/m);
  return m ? Number(m[1]) : null;
};
/** The per-request inputs that force a dynamic render whatever else the module exports. */
const requestInputs = (src: string) =>
  [
    /\bsearchParams\b/.test(src) ? "searchParams" : null,
    /\bheaders\(\)/.test(src) ? "headers()" : null,
    /\bcookies\(\)/.test(src) ? "cookies()" : null,
  ].filter(Boolean) as string[];

interface RouteModule {
  /** Path below src/app, e.g. "[league]/teams/[slug]/page.tsx". */
  rel: string;
  src: string;
  /** Dynamic segments that no layout above the module enumerates. */
  uncovered: string[];
}

function scan(): RouteModule[] {
  const out: RouteModule[] = [];
  const walk = (dir: string, rel: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      const relPath = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walk(path, relPath);
        continue;
      }
      if (!ROUTE_FILE.test(entry.name)) continue;
      const segments = relPath.split("/").slice(0, -1);
      const uncovered: string[] = [];
      segments.forEach((segment, i) => {
        if (!segment.startsWith("[")) return;
        // A layout sitting in the segment's own folder names that segment's values for everything
        // below it (src/app/[league]/layout.tsx, src/app/tennis/[tour]/layout.tsx).
        const dirOfSegment = join(APP, ...segments.slice(0, i + 1));
        const covered = readdirSync(dirOfSegment).some((f) => LAYOUT_FILE.test(f) && hasStaticParams(code(join(dirOfSegment, f))));
        if (!covered) uncovered.push(segment);
      });
      out.push({ rel: relPath, src: code(path), uncovered });
    }
  };
  walk(APP, "");
  return out;
}

const MODULES = scan();
const DYNAMIC_SEGMENT_MODULES = MODULES.filter((m) => m.uncovered.length > 0);

test("the scan finds the app's route modules", () => {
  assert.ok(MODULES.length > 40, `found ${MODULES.length} route modules`);
  assert.ok(DYNAMIC_SEGMENT_MODULES.length > 20, `found ${DYNAMIC_SEGMENT_MODULES.length} with an unenumerated dynamic segment`);
});

test("every route under a dynamic segment is cached, or says why it is not", () => {
  const missing = DYNAMIC_SEGMENT_MODULES.filter((m) => !hasStaticParams(m.src) && !(m.rel in DYNAMIC_ON_PURPOSE));
  assert.deepEqual(
    missing.map((m) => m.rel),
    [],
    "these render on every request and their revalidate never applies: add generateStaticParams, or add them to DYNAMIC_ON_PURPOSE with a reason"
  );
});

test("a route that is dynamic on purpose has not quietly gained generateStaticParams", () => {
  for (const [rel, reason] of Object.entries(DYNAMIC_ON_PURPOSE)) {
    const mod = MODULES.find((m) => m.rel === rel);
    assert.ok(mod, `${rel} is still in the app (the allowlist is stale otherwise)`);
    assert.equal(hasStaticParams(mod.src), false, `${rel} must stay dynamic: ${reason}`);
  }
});

test("a route that reads the request cannot claim to be cacheable", () => {
  for (const mod of MODULES) {
    const inputs = requestInputs(mod.src);
    if (inputs.length === 0) continue;
    assert.equal(hasStaticParams(mod.src), false, `${mod.rel} reads ${inputs.join(", ")}, so it renders per request; generateStaticParams there is a lie`);
  }
});

test("no cached route outlives the site-wide age cap", () => {
  const cap = expireTime();
  assert.equal(cap, 300, "the cap in next.config.ts is five minutes");
  for (const mod of MODULES.filter((m) => hasStaticParams(m.src))) {
    const revalidate = revalidateOf(mod.src);
    if (revalidate === null) continue; // layouts set no window of their own
    if (mod.rel in LONG_LIVED) {
      assert.ok(revalidate > cap, `${mod.rel} is listed as long-lived, so it should say so with a longer window`);
      continue;
    }
    assert.ok(
      revalidate <= cap,
      `${mod.rel} keeps a copy for ${revalidate}s but the cap is ${cap}s, so Cloudflare would serve it longer than the origin allows: lower it, or add it to LONG_LIVED with a reason`
    );
  }
});

test("the cached routes and their windows are exactly the ones listed here", () => {
  const cached = MODULES.filter((m) => hasStaticParams(m.src) && !LAYOUT_FILE.test(m.rel.split("/").pop()!));
  assert.deepEqual(cached.map((m) => m.rel).sort(), Object.keys(REVALIDATE).sort());
  for (const mod of cached) {
    assert.equal(revalidateOf(mod.src), REVALIDATE[mod.rel], `${mod.rel} revalidate`);
  }
});

// The exports have to survive being loaded, not just being grepped: an array from
// generateStaticParams and no dynamicParams override, so an address that was never built still
// renders on demand and 404s through notFound() exactly as before.
for (const rel of Object.keys(REVALIDATE)) {
  test(`${rel} loads with a usable generateStaticParams`, async () => {
    const mod = (await import(`../src/app/${rel.replace(/\.tsx?$/, "")}`)) as Record<string, unknown>;
    assert.equal(typeof mod.generateStaticParams, "function");
    assert.ok(Array.isArray(await (mod.generateStaticParams as () => unknown)()));
    assert.equal(mod.revalidate, REVALIDATE[rel]);
    assert.equal(mod.dynamicParams, undefined, "dynamicParams stays at its default");
  });
}

for (const rel of ["[league]/layout", "tennis/[tour]/layout"]) {
  test(`${rel} names its segment's values`, async () => {
    const mod = (await import(`../src/app/${rel}`)) as Record<string, unknown>;
    assert.equal(typeof mod.generateStaticParams, "function");
    const params = await (mod.generateStaticParams as () => unknown)();
    assert.ok(Array.isArray(params) && params.length > 0);
  });
}

// One read of searchParams on the player page would make every player page in every league render
// per request. The cricket split it used to read is a tab in the page now.
test("the player page does not read searchParams", () => {
  const mod = MODULES.find((m) => m.rel === "[league]/players/[slug]/page.tsx")!;
  assert.deepEqual(requestInputs(mod.src), [], "the player page renders from params alone");
});
