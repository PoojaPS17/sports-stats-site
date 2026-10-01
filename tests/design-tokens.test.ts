import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const css = readFileSync(join(__dirname, "../src/app/globals.css"), "utf8");
const layout = readFileSync(join(__dirname, "../src/app/layout.tsx"), "utf8");

// Everything between the first `:root {` and its closing brace: the light palette every other block overrides.
const rootBlock = css.slice(css.indexOf(":root {"), css.indexOf("}", css.indexOf(":root {")));

test("the light :root block defines the signature, masthead and display-font tokens", () => {
  for (const token of ["--sig:", "--sig-ink:", "--sig-soft:", "--sig-on:", "--mast:", "--mast-2:", "--mast-text:", "--mast-muted:", "--font-display:"]) {
    assert.match(rootBlock, new RegExp(token.replace(/[-]/g, "\\-")), token);
  }
  assert.match(rootBlock, /--volt:\s*#c6f135/i, "Volt is kept as a fixed token");
  assert.match(rootBlock, /--sig:\s*#1470af/i, "the light theme's signature colour is the store blue");
  assert.match(rootBlock, /--sig-ink:\s*#1470af/i);
  assert.match(rootBlock, /--sig-on:\s*#ffffff/i);
  assert.match(rootBlock, /--mast:\s*#ffffff/i, "light bands are white");
  assert.match(rootBlock, /--band-deep:\s*#0d2b57/i, "the scores strip and footer sit on the deep navy band");
});

test("--accent is remapped to the signature ink so existing components inherit it", () => {
  assert.match(rootBlock, /--accent:\s*var\(--sig-ink\)/);
  assert.match(rootBlock, /--accent-soft:\s*var\(--sig-soft\)/);
  assert.match(rootBlock, /--header-bg:\s*var\(--mast\)/);
});

test("the dark theme makes Volt the signature colour and the ink, in both the media block and the explicit toggle", () => {
  for (const [label, re] of [
    ["signature", /--sig:\s*var\(--volt\)/g],
    ["ink", /--sig-ink:\s*var\(--sig\)/g],
    ["masthead", /--mast:\s*#07090f/g],
  ] as const) {
    const n = (css.match(re) ?? []).length;
    assert.ok(n >= 2, `expected the dark ${label} remap twice (media + data-theme), found ${n}`);
  }
});

test("Plus Jakarta Sans is loaded in the root layout and serves as both the body and the display face", () => {
  assert.match(layout, /Plus_Jakarta_Sans\(/);
  assert.match(layout, /variable:\s*"--font-jakarta"/);
  assert.match(css, /--font-display:\s*var\(--font-jakarta\)/);
  assert.match(css, /--font-sans:\s*var\(--font-jakarta\)/);
  assert.doesNotMatch(layout, /Barlow_Condensed|Geist\(/);
});
