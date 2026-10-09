import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gridRows } from "../src/lib/homeSetup";

// Two layout bugs measured in headless Chrome on the built home page and the scores strip:
//  - the footer rode down as the hero and blocks mounted (CLS 0.5 at 1440, 0.7 to 1.2 at 375);
//  - the strip stretched the page sideways (scrollWidth 1872 at 1440, 1728 at 375).

const root = join(__dirname, "..");
const css = readFileSync(join(root, "src/app/globals.css"), "utf8");
const layout = readFileSync(join(root, "src/app/layout.tsx"), "utf8");
const page = readFileSync(join(root, "src/app/page.tsx"), "utf8");

test(".strip-scroll is the containing block of the chips' absolutely positioned children", () => {
  const rule = css.match(/\.strip-scroll\s*\{([^}]*)\}/);
  assert.ok(rule, ".strip-scroll rule exists");
  assert.match(rule[1], /position:\s*relative/, "the sr-only 'Live:' span is position:absolute and escapes an overflow box that is not positioned");
  assert.match(rule[1], /mask-image/, "the fade is untouched");
});

test("the strip still scrolls inside its own container", () => {
  const ticker = readFileSync(join(root, "src/components/Ticker.tsx"), "utf8");
  assert.match(ticker, /strip-scroll flex min-w-0 flex-1[^"]*overflow-x-auto/);
});

test("the home page wrapper reserves height for the built page", () => {
  assert.match(page, /className="home-page flex flex-col gap-10"/);
  const rule = css.match(/:root\[data-home="built"\]\s+\.home-page\s*\{([^}]*)\}/);
  assert.ok(rule, "reserve rule exists and only applies to the built page");
  assert.match(rule[1], /min-height:\s*calc\([^;]*var\(--hb-rows/);
});

test("the pre-paint script sets --hb-rows with the same arithmetic as gridRows", () => {
  assert.match(layout, /--hb-rows/);
  assert.match(layout, /w >= 1280 \? 3 : w >= 768 \? 2 : 1/);
  assert.match(layout, /b\.length \+ 1 \+ \(c > 1 && hasLive \? 1 : 0\)/);
});

test("gridRows counts the add button and the two-column live block", () => {
  assert.equal(gridRows([], 375), 1);
  assert.equal(gridRows(["standings", "bts"], 375), 3);
  assert.equal(gridRows(["live", "standings", "bts"], 375), 4, "one column: live takes one slot");
  assert.equal(gridRows(["live", "standings", "bts"], 800), 3, "two columns: live spans two, 3+1+1 slots");
  assert.equal(gridRows(["live", "a", "b", "c", "d", "e"], 1440), 3, "three columns: 6+1+1 slots");
  assert.equal(gridRows(["a", "b", "c", "d", "e"], 1440), 2);
});

test("applyHomeAttribute keeps --hb-rows in step with the setup", async () => {
  const { applyHomeAttribute, newSetup } = await import("../src/lib/homeSetup");
  const props: Record<string, string> = {};
  const style = { setProperty: (k: string, v: string) => (props[k] = v), removeProperty: (k: string) => delete props[k] };
  (globalThis as { document?: unknown }).document = { documentElement: { dataset: {}, style } };
  (globalThis as { window?: unknown }).window = { innerWidth: 1440 };
  try {
    applyHomeAttribute(newSetup("world", null, [{ id: "live", type: "live", params: {}, label: "Live" }]));
    assert.equal(props["--hb-rows"], "1");
    applyHomeAttribute(null);
    assert.equal("--hb-rows" in props, false);
  } finally {
    delete (globalThis as { document?: unknown }).document;
    delete (globalThis as { window?: unknown }).window;
  }
});
