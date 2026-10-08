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
  assert.match(rootBlock, /--volt:\s*var\(--sky\)/i, "--volt keeps its name and is now Sky Blue");
  assert.match(rootBlock, /--sky:\s*#38b6e8/i);
  assert.match(rootBlock, /--navy:\s*#0f2745/i);
  assert.match(rootBlock, /--logo-lit:\s*#c6f135/i, "the logo keeps its own lit colour");
  assert.match(rootBlock, /--sig:\s*#2563d9/i, "the light theme's interaction colour is Sports Blue");
  assert.match(rootBlock, /--sig-ink:\s*#2563d9/i);
  assert.match(rootBlock, /--sig-on:\s*#ffffff/i);
  assert.match(rootBlock, /--mast:\s*#ffffff/i, "light bands are white");
  assert.match(rootBlock, /--band-deep:\s*#0f2745/i, "the scores strip and footer sit on the deep navy band");
});

test("--accent is remapped to the signature ink so existing components inherit it", () => {
  assert.match(rootBlock, /--accent:\s*var\(--sig-ink\)/);
  assert.match(rootBlock, /--accent-soft:\s*var\(--sig-soft\)/);
  assert.match(rootBlock, /--header-bg:\s*var\(--mast\)/);
});

test("the dark theme lifts Sports Blue to be the signature colour and ink, in both the media block and the explicit toggle", () => {
  for (const [label, re] of [
    ["signature", /--sig:\s*#6ea8ff/g],
    ["ink", /--sig-ink:\s*var\(--sig\)/g],
    ["masthead", /--mast:\s*#0a1830/g],
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

test("the SPORTSDB logo and header keep their pre-Palette-B colours in both themes (brand lock)", () => {
  assert.match(css, /header\.sticky\s*\{[^}]*--sig:\s*#1470af/, "light header: store-blue lit block and DB");
  assert.match(css, /header\.sticky\s*\{[^}]*--mast:\s*#07090f[^}]*--sig:\s*var\(--logo-lit\)/, "dark header: near-black bar, lime lit block");
  assert.match(css, /footer\.band-deep a\[href="\/"\]\s*\{\s*--sig:\s*#9cc7ea/, "light footer lockup unchanged");
});

test("no lime survives as an accent: --volt resolves to Sky, and only the logo lockup keeps #c6f135", () => {
  const stripped = css.replace(/--logo-lit:\s*#c6f135;/, "");
  assert.doesNotMatch(stripped, /c6f135/i);
  assert.doesNotMatch(stripped, /198,\s*241,\s*53/);
});

test("a loss is neutral grey, so red and coral mean LIVE only", () => {
  assert.match(rootBlock, /--loss:\s*#4a6178/i);
  assert.match(rootBlock, /--loss-tint:\s*#eef2f7/i);
  assert.match(rootBlock, /--live:\s*#b42318/i);
  assert.doesNotMatch(css, /--loss:\s*#(ba0329|f87171)/i);
  assert.match(css, /\.result-l\s*\{[^}]*var\(--loss-tint\)/);
});
