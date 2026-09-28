import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { articleArt, paletteForTags, ART_GRADIENT, ART_PALETTES } from "../src/lib/articleArt";

test("a declared art block is used as is", () => {
  const a = articleArt({ art: { number: "9", caption: "men's golds since 1990", palette: "asian-games" }, tags: ["kabaddi"] });
  assert.deepEqual(a, { number: "9", caption: "men's golds since 1990", palette: "asian-games", sport: "Asian Games" });
});

test("art that names no palette takes it, and the sport label, from the first recognised tag", () => {
  assert.equal(paletteForTags(["premier-league", "man-city"]), "football");
  assert.equal(paletteForTags(["formula-1"]), "f1");
  assert.equal(paletteForTags(["f1"]), "f1");
  assert.equal(paletteForTags(["ipl", "cricket"]), "cricket");
  assert.equal(paletteForTags(["something-else"]), "neutral");
  // The palette is the one thing an article's tags already answer, so it is the one part of the
  // art block a draft may leave out. Number and caption it has to write.
  const a = articleArt({ art: { number: "8", caption: "straight wins" }, tags: ["laliga", "barcelona"] });
  assert.equal(a.number, "8");
  assert.equal(a.caption, "straight wins");
  assert.equal(a.palette, "football");
  assert.equal(a.sport, "Football");
});

test("every palette has a CSS class in globals.css", async () => {
  const { readFileSync } = await import("node:fs");
  const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
  for (const p of ART_PALETTES) assert.match(css, new RegExp(`\\.art-${p}\\b`), p);
});

// The index cards paint an article's panel from globals.css; the share card has to paint the same
// panel through satori, which reads neither the stylesheet nor a custom property. That leaves two
// copies of eight gradients, so this holds them to the same colours: a repaint that touches one
// and forgets the other fails here rather than shipping a card in last season's palette.
const css = readFileSync(fileURLToPath(new URL("../src/app/globals.css", import.meta.url)), "utf8");
const root = css.slice(css.indexOf(":root {"), css.indexOf("}", css.indexOf(":root {")));

/** Every colour in a gradient, lower-cased, with `var(--token)` resolved from the light :root block. */
function colours(gradient: string): string[] {
  const resolved = gradient.replace(/var\((--[a-z0-9-]+)\)/gi, (_, token: string) => {
    const m = root.match(new RegExp(`${token}:\\s*([^;]+);`));
    assert.ok(m, `:root defines ${token}`);
    return m[1].trim();
  });
  return (resolved.match(/#[0-9a-f]{3,8}\b/gi) ?? []).map((c) => c.toLowerCase());
}

test("the share card's gradients are the stylesheet's, palette for palette", () => {
  for (const palette of ART_PALETTES) {
    const rule = css.match(new RegExp(`\\.art-${palette}\\s*\\{\\s*background:\\s*([^;]+);`));
    assert.ok(rule, `globals.css still has a .art-${palette} rule`);
    assert.deepEqual(colours(ART_GRADIENT[palette]), colours(rule[1]), palette);
  }
});

test("every palette has a gradient, and no gradient outlives its palette", () => {
  assert.deepEqual(Object.keys(ART_GRADIENT).sort(), [...ART_PALETTES].sort());
});
