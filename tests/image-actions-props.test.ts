import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("ImageActions accepts an optional imageUrl prop and makes card optional when it's used", () => {
  const src = readFileSync("src/components/ImageActions.tsx", "utf8");
  assert.match(src, /imageUrl\?:\s*string/, "imageUrl must be an optional prop");
  assert.match(src, /card\?:\s*ReactNode/, "card must become optional now that imageUrl is an alternative render source");
});

test("render() fetches imageUrl as a blob when provided, instead of requiring html-to-image", () => {
  const src = readFileSync("src/components/ImageActions.tsx", "utf8");
  assert.match(src, /if\s*\(imageUrl\)/);
  assert.match(src, /fetch\(imageUrl\)/);
});
