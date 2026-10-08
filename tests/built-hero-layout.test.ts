import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// The built hero (BuiltHero.tsx + HeroDecor.tsx, `.bhero-*` / `.hd-*` in globals.css): the actions sit in a
// left-aligned row directly under the sub-line (they used to float mid-hero on the right), and the solid
// decoration (dot, pill) stays in the empty right-hand corners, never behind a long headline.

const root = join(__dirname, "..");
const tsx = readFileSync(join(root, "src/components/home/BuiltHero.tsx"), "utf8");
const css = readFileSync(join(root, "src/app/globals.css"), "utf8");

test("the actions row follows the sub-line in one column, Jump to live then Edit blocks then Send to my phone", () => {
  assert.doesNotMatch(tsx, /lg:flex-row|lg:justify-between/, "no side-by-side layout: the buttons no longer float right");
  const h1 = tsx.indexOf("<h1");
  const sub = tsx.indexOf("{sub &&");
  const actions = tsx.indexOf('className="bhero-actions"');
  assert.ok(h1 > 0 && sub > h1 && actions > sub, "headline, sub-line, then actions");
  const jump = tsx.indexOf("Jump to live");
  const edit = tsx.indexOf("Edit blocks");
  const send = tsx.indexOf("<SendToPhone");
  assert.ok(actions < jump && jump < edit && edit < send, "tab order kept");
  assert.ok(tsx.indexOf("</section>") > send);
});

test("the actions row is a wrapping, left-aligned flex row", () => {
  const rule = css.match(/\.bhero-actions\s*\{([^}]*)\}/);
  assert.ok(rule, ".bhero-actions rule exists");
  assert.match(rule[1], /display:\s*flex/);
  assert.match(rule[1], /flex-wrap:\s*wrap/);
  assert.doesNotMatch(rule[1], /justify-content|margin-left:\s*auto/);
});

test("the dot and the pill sit in the right-hand corners, clipped by the band, and only from 1000px up", () => {
  const dot = css.match(/\.home-decor \.hd-dot\s*\{([^}]*)\}/);
  assert.ok(dot);
  assert.match(dot[1], /right:\s*-\d+px/, "half clipped at the band edge");
  assert.doesNotMatch(dot[1], /right:\s*\d+%/, "no longer a percentage that lands on the headline");
  assert.match(css, /\.home-decor-built \.hd-bar-a\s*\{\s*display:\s*none;/, "pill hidden on narrow screens, where text spans the band");
  const wide = css.match(/@media \(min-width: 1000px\)\s*\{\s*\.home-decor \.hd-dot\s*\{\s*display:\s*block;[\s\S]*?\.home-decor-built \.hd-bar-a\s*\{([^}]*)\}/);
  assert.ok(wide, "dot and pill switch on at 1000px");
  assert.match(wide[1], /bottom:\s*-\d+px/);
  assert.match(wide[1], /right:\s*-\d+px/);
});
