// Option C: the site-wide --border token takes the --border-strong value, so every card, divider, chip
// and control that shares it gets the darker outline. Header and export/share images stay as they were.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CARD } from "../src/lib/exportTheme";

const root = join(__dirname, "..");
const css = readFileSync(join(root, "src/app/globals.css"), "utf8");

/** The declaration block that opens with `selector {`. */
function block(selector: string): string {
  const at = css.indexOf(`${selector} {`);
  assert.ok(at >= 0, selector);
  return css.slice(at, css.indexOf("}", at));
}

test("--border equals --border-strong in light and in dark", () => {
  const light = block("\n:root");
  assert.match(light, /--border: var\(--border-strong\);/);
  assert.match(light, /--border-strong: #b3c7db;/);
  for (const sel of [':root:not([data-theme="light"])', ':root[data-theme="dark"]']) {
    const dark = block(sel);
    assert.match(dark, /--border: var\(--border-strong\);/, sel);
    assert.match(dark, /--border-strong: #3b6190;/, sel);
  }
});

test("the old faint values are gone from the stylesheet tokens", () => {
  assert.doesNotMatch(css, /--border: #dde8f2;/);
  assert.doesNotMatch(css, /--border: #25446d;/);
});

test("card hover goes to the interaction blue, in @layer components, tokens only", () => {
  const at = css.indexOf("a.card:hover,");
  const rule = css.slice(at, css.indexOf("}", at));
  assert.match(rule, /\.card-link:hover/);
  assert.match(rule, /border-color: var\(--sig-ink\);/);
  assert.doesNotMatch(rule, /#[0-9a-fA-F]{3,8}\b|rgba?\(/);
  assert.ok(css.lastIndexOf("@layer components", at) > css.lastIndexOf("\n}\n", at), "inside @layer components");
});

test("export and share-image cards keep their own border", () => {
  assert.equal(CARD.border, "#dde8f2");
});
