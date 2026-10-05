import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { isStoredFinalGame } from "../src/lib/gameCache";

test("a stored game is final when it is completed and its report is stored", () => {
  assert.equal(isStoredFinalGame({ completed: true, has_details: true }), true);
  assert.equal(isStoredFinalGame({ completed: true, has_details: false }), false, "a finished game without its report still reads ESPN live, so it is not frozen");
  assert.equal(isStoredFinalGame({ completed: false, has_details: true }), false);
  assert.equal(isStoredFinalGame(null), false);
});

test("the public game route stays dynamic and the final route is the cached copy of it", () => {
  const read = (rel: string) => readFileSync(fileURLToPath(new URL(`../src/app/[league]/games/${rel}`, import.meta.url)), "utf8");
  const live = read("[id]/page.tsx");
  assert.match(live, /^export const revalidate = 10;$/m);
  assert.doesNotMatch(live, /^export function generateStaticParams/m, "the public route renders per request: a game in play must never be cached");
  const final = read("final/[id]/page.tsx");
  assert.match(final, /^export const revalidate = 86400;$/m);
  assert.match(final, /^export function generateStaticParams\(\) \{\s*return \[\];\s*\}/m);
  assert.match(final, /export \{ default, generateMetadata \} from "\.\.\/\.\.\/\[id\]\/page";/, "the same page, so the two routes cannot drift apart");
});
