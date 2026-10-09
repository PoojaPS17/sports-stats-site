import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { clearSetup, newSetup, readSetup, removeBlock, SETUP_KEY, writeSetup } from "../src/lib/homeSetup";
import { blockId, type HomeBlock } from "../src/lib/blockTypes";

// The way out of a built homepage: selected chips toggle off, every built state has a "Back to full site view",
// and removing the last block (anywhere) lands on the full home, never an empty built page.

const root = join(__dirname, "..");
const read = (f: string) => readFileSync(join(root, f), "utf8");
const palette = read("src/components/home/BlockPalette.tsx");
const builder = read("src/components/home/HomeBuilder.tsx");
const blocks = read("src/components/home/HomeBlocks.tsx");
const hero = read("src/components/home/BuiltHero.tsx");
const back = read("src/components/home/BackToFullSite.tsx");
const picker = read("src/components/home/SportPicker.tsx");
const css = read("src/app/globals.css");

const live: HomeBlock = { id: "live", type: "live", params: {}, label: "Live" };
const epl: HomeBlock = { id: blockId("standings", { league: "epl" }), type: "standings", params: { league: "epl" }, label: "Premier League standings" };

test("a ticked palette chip is not disabled when it can be taken off, and clicking it unpicks", () => {
  assert.match(palette, /disabled=\{on && !onUnpick\}/);
  assert.match(palette, /on \? onUnpick\?\.\(ids\.filter\(\(id\) => existing\.has\(id\)\)\) : onPick\(b\)/);
  assert.match(builder, /onUnpick=\{unpick\}/);
  assert.match(builder, /const unpick = \(ids: string\[\]\) => setBlocks\(\(list\) => list\.filter\(\(b\) => !ids\.includes\(b\.id\)\)\)/);
  assert.match(blocks, /onUnpick=\{onUnpick\}/);
});

test("the editor, the built hero and the foot of the built page all offer Back to full site view", () => {
  assert.match(back, /Back to full site view/);
  assert.match(back, /clearSetup\(\)/);
  assert.match(back, /window\.confirm\(/);
  assert.match(builder, /<BackToFullSite/);
  assert.match(hero, /<BackToFullSite/);
  assert.match(blocks, /<BackToFullSite/);
  const actions = hero.indexOf('className="bhero-actions"');
  assert.ok(actions > 0 && hero.indexOf("<BackToFullSite") > hero.indexOf("<SendToPhone"), "after the existing actions, so their tab order is kept");
});

test("leaving the full-site view also closes the editor and the add dialog", () => {
  assert.match(blocks, /if \(!isSetup\(s\)\) \{[\s\S]*?setEditing\(false\);[\s\S]*?setAdding\(false\);/);
  assert.match(blocks, /if \(next\.blocks\.length === 0\) clearSetup\(\);/);
});

test("the first-visit picker can clear its picks", () => {
  assert.match(picker, /Clear my picks/);
  assert.match(css, /\.pk-clear\s*\{/);
});

test("Everything (collapsed) keeps the first-visit modules; a built page still hides them", () => {
  assert.match(css, /:root\[data-home="built"\] \.home-firstvisit\s*\{\s*display:\s*none;/);
  assert.doesNotMatch(css, /:root\[data-home="collapsed"\] \.home-firstvisit/);
});

test("removing every block, or clearing, leaves nothing stored and no data-home", () => {
  const store: Record<string, string> = {};
  const dataset: Record<string, string> = {};
  const g = globalThis as { window?: unknown; document?: unknown };
  g.window = {
    innerWidth: 1440,
    localStorage: { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => void (store[k] = v), removeItem: (k: string) => void delete store[k] },
    dispatchEvent: () => true,
  };
  g.document = { documentElement: { dataset, style: { setProperty() {}, removeProperty() {} } } };
  try {
    const s = newSetup("world", null, [live, epl]);
    writeSetup(s);
    assert.equal(dataset.home, "built");
    assert.equal(removeBlock(removeBlock(s, "live"), epl.id).blocks.length, 0);
    clearSetup();
    assert.equal(store[SETUP_KEY], undefined);
    assert.equal("home" in dataset, false);
    assert.equal(readSetup(), null);
  } finally {
    delete g.window;
    delete g.document;
  }
});
