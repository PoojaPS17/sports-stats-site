import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { reserveHeight } from "../src/lib/homeSetup";

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
  assert.match(rule[1], /min-height:\s*var\(--hb-h/);
});

type B = { type: string; params: Record<string, string> };
const bk = (type: string, params: Record<string, string> = {}): B => ({ type, params });

// Runs the real pre-paint script from layout.tsx with a fake browser and returns the --hb-h it sets (px), or null.
function runPrePaint(blocks: B[], width: number, search = ""): number | null {
  const m = layout.match(/const HOME_INIT = `([\s\S]*?)`;/);
  assert.ok(m, "HOME_INIT script found");
  assert.match(layout, /<script id="home-init" dangerouslySetInnerHTML=\{\{ __html: HOME_INIT \}\}/, "an inline script in <head>, not next/script (which runs after first paint)");
  const props: Record<string, string> = {};
  const root = { dataset: {} as Record<string, string>, style: { setProperty: (k: string, v: string) => (props[k] = v) } };
  runInNewContext(m[1], {
    localStorage: { getItem: () => JSON.stringify({ v: 1, blocks }) },
    location: { search },
    innerWidth: width,
    document: { documentElement: root },
  });
  assert.equal(root.dataset.home, "built");
  return "--hb-h" in props ? parseFloat(props["--hb-h"]) : null;
}

test("the pre-paint script reserves exactly what reserveHeight computes", () => {
  const setups: B[][] = [
    [bk("bts")],
    [bk("live"), bk("team-next", { league: "cricket", team: "6" }), bk("series-standings", { series: "8048-2026" }), bk("standings", { league: "nba" }), bk("bts")],
    [bk("team-next", { league: "epl", team: "arsenal" }), bk("player-form", { league: "odi", player: "x" }), bk("f1-drivers"), bk("standings", { league: "epl" }), bk("live"), bk("mystery")],
  ];
  for (const w of [375, 800, 1280, 1440]) for (const s of setups) assert.equal(runPrePaint(s, w), reserveHeight(s, w), `width ${w}, ${s.length} blocks`);
});

// Real heights measured on sports-db.live (5 blocks: live, team-next:cricket:6, series-standings, standings:nba, bts):
// the built page was 1553px tall at 1280, 1854 at 800 and 2729 at 375. The reserve must be close and never above.
test("reserveHeight is within 10% under the measured page for the five-block setup", () => {
  const five = [bk("live"), bk("team-next", { league: "cricket", team: "6" }), bk("series-standings", { series: "8048-2026" }), bk("standings", { league: "nba" }), bk("bts")];
  for (const [w, actual] of [[1280, 1553], [800, 1854], [375, 2729]] as const) {
    const r = reserveHeight(five, w);
    assert.ok(r <= actual * 1.02, `${w}: reserve ${r} must not exceed final ${actual}`);
    assert.ok(r >= actual * 0.88, `${w}: reserve ${r} is too far under final ${actual}`);
  }
  // 1 x bts: 636 at 1280, 759 at 375
  assert.ok(Math.abs(reserveHeight([bk("bts")], 1280) - 636) < 70);
  assert.ok(Math.abs(reserveHeight([bk("bts")], 375) - 759) < 90);
});

test("reserveHeight places cards like the grid: row height is the tallest card, live spans two columns", () => {
  // 3 columns: row 1 = live (640, 2 wide) + team-next cricket (285); row 2 = bts (330) + add (96); 16px gap; hero 270 + 80
  assert.equal(reserveHeight([bk("live"), bk("team-next", { league: "cricket", team: "6" }), bk("bts")], 1440), 350 + 640 + 330 + 16);
  // 1 column: every card on its own row
  assert.equal(reserveHeight([bk("bts"), bk("f1-drivers")], 375), 360 + 330 + 270 + 96 + 2 * 16);
  // a wide card that does not fit the rest of its row starts the next one (2 columns)
  assert.equal(reserveHeight([bk("bts"), bk("live")], 800), 350 + 330 + 640 + 96 + 2 * 16);
  assert.ok(reserveHeight([], 375) > 0);
});

test("applyHomeAttribute keeps --hb-h in step with the setup", async () => {
  const { applyHomeAttribute, newSetup } = await import("../src/lib/homeSetup");
  const props: Record<string, string> = {};
  const style = { setProperty: (k: string, v: string) => (props[k] = v), removeProperty: (k: string) => delete props[k] };
  (globalThis as { document?: unknown }).document = { documentElement: { dataset: {}, style } };
  (globalThis as { window?: unknown }).window = { innerWidth: 1440 };
  try {
    applyHomeAttribute(newSetup("world", null, [{ id: "live", type: "live", params: {}, label: "Live" }]));
    assert.equal(props["--hb-h"], reserveHeight([bk("live")], 1440) + "px");
    applyHomeAttribute(null);
    assert.equal("--hb-h" in props, false);
  } finally {
    delete (globalThis as { document?: unknown }).document;
    delete (globalThis as { window?: unknown }).window;
  }
});
