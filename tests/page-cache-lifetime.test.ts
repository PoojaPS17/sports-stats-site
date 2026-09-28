import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// The edge cache follows the origin's cache-control header. A page that is fully static and
// declares no revalidate window is served with s-maxage=31536000, so Cloudflare keeps the copy it
// took at first request for a year and every later deploy is invisible on that URL until someone
// purges it by hand (which is how the Beyond the Scoreline index kept its old design after the
// broadcast redesign shipped). Every page therefore says how long it may live, unless it reads the
// request (searchParams) and is rendered per request anyway.
function pages(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) pages(path, out);
    else if (entry === "page.tsx") out.push(path);
  }
  return out;
}

test("every page declares a cache lifetime or is rendered per request", () => {
  const offenders = pages("src/app").filter((path) => {
    const source = readFileSync(path, "utf8");
    if (/^export const (revalidate|dynamic)\b/m.test(source)) return false;
    return !source.includes("searchParams");
  });
  assert.deepEqual(offenders, []);
});
