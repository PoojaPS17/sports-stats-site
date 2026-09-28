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
  assert.match(rootBlock, /--sig:\s*#c6f135/i, "Volt is the signature colour");
  assert.match(rootBlock, /--sig-ink:\s*#4d7c0f/i);
  assert.match(rootBlock, /--mast:\s*#0b1324/i);
});

test("--accent is remapped to the signature ink so existing components inherit it", () => {
  assert.match(rootBlock, /--accent:\s*var\(--sig-ink\)/);
  assert.match(rootBlock, /--accent-soft:\s*var\(--sig-soft\)/);
  assert.match(rootBlock, /--header-bg:\s*var\(--mast\)/);
});

test("the dark theme makes Volt itself the ink, in both the media block and the explicit toggle", () => {
  const darkBlocks = css.match(/--sig-ink:\s*var\(--sig\)/g) ?? [];
  assert.ok(darkBlocks.length >= 2, `expected the dark ink remap twice (media + data-theme), found ${darkBlocks.length}`);
});

test("Barlow Condensed is loaded in the root layout and exposed as --font-display", () => {
  assert.match(layout, /Barlow_Condensed\(/);
  assert.match(layout, /variable:\s*"--font-barlow"/);
  assert.match(css, /--font-display:\s*var\(--font-barlow\)/);
});
