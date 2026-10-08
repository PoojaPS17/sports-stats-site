// The home blocks' outlines are one step darker than the site-wide .card edge: a token with light and dark values,
// applied through a wrapper class so the default .card (and every other page) is unchanged.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
const css = readFileSync(join(root, "src/app/globals.css"), "utf8");

test("--border-block is defined for light and for both dark blocks, from existing Palette B tokens", () => {
  const defs = css.match(/--border-block:[^;]+;/g) ?? [];
  assert.equal(defs.length, 3, "light :root plus the two dark blocks");
  for (const d of defs) assert.match(d, /color-mix\(in srgb, var\(--border-strong\) \d+%, var\(--border\)\)/);
  assert.doesNotMatch(defs.join(""), /#[0-9a-fA-F]{3,8}\b|rgba?\(/);
});

test("the wrapper scopes the darker outline; the site-wide .card default stays on --border", () => {
  assert.match(css, /:where\(\.home-outline, \.scores-page\) \.card \{\s*border-color: var\(--border-block\);/);
  assert.match(css, /\.card,\s*\.player-grid > a \{[^}]*border: 1px solid var\(--border\);/);
  assert.match(css, /:where\(\.home-outline, \.scores-page\) a\.card:hover,[^{]*\{\s*border-color: var\(--sig-ink\);/);
  assert.match(css, /\.home-strip \{[^}]*border-bottom: 1px solid var\(--border-block\);/);
  const rule = css.indexOf(":where(.home-outline, .scores-page) .card {");
  assert.ok(css.lastIndexOf("@layer components", rule) > css.lastIndexOf("\n}\n", rule), "inside @layer components");
});

test("the home page and the try-a-name card use it", () => {
  assert.match(readFileSync(join(root, "src/app/page.tsx"), "utf8"), /className="home-outline /);
  assert.match(readFileSync(join(root, "src/components/home/TryNameIsland.tsx"), "utf8"), /border-\[var\(--border-block\)\]/);
});
