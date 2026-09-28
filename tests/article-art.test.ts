import { test } from "node:test";
import assert from "node:assert/strict";
import { articleArt, paletteForTags, ART_PALETTES } from "../src/lib/articleArt";

test("a declared art block is used as is", () => {
  const a = articleArt({ art: { number: "9", caption: "men's golds since 1990", palette: "asian-games" }, tags: ["kabaddi"] });
  assert.deepEqual(a, { number: "9", caption: "men's golds since 1990", palette: "asian-games", sport: "Asian Games" });
});

test("without art, the palette and sport come from the first recognised tag", () => {
  assert.equal(paletteForTags(["premier-league", "man-city"]), "football");
  assert.equal(paletteForTags(["formula-1"]), "f1");
  assert.equal(paletteForTags(["f1"]), "f1");
  assert.equal(paletteForTags(["ipl", "cricket"]), "cricket");
  assert.equal(paletteForTags(["something-else"]), "neutral");
  const a = articleArt({ tags: ["nba"] });
  assert.equal(a.number, null);
  assert.equal(a.palette, "nba");
  assert.equal(a.sport, "NBA");
});

test("every palette has a CSS class in globals.css", async () => {
  const { readFileSync } = await import("node:fs");
  const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
  for (const p of ART_PALETTES) assert.match(css, new RegExp(`\\.art-${p}\\b`), p);
});
