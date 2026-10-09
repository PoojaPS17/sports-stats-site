import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
const css = read("src/app/globals.css");

// Owner's phone (~430px): a 420px minimum table plus padding scrolled sideways inside the card with no cue, so the
// strike-rate column, the extras line and the total line looked cut off. Measured in headless Chrome at 320-768px:
// the tables now fit the card, and only a genuinely wider row scrolls, with an edge shadow.
for (const file of ["src/components/CricketScorecardPanel.tsx", "src/components/CricketScorecard.tsx"]) {
  test(`${file}: tables fit a phone and keep a visible scroll fallback`, () => {
    const src = read(file);
    assert.ok(!/min-w-\[4\d\dpx\]/.test(src), "no fixed 400px+ minimum width on the table");
    assert.ok(src.includes('className="scorecard-scroll"'), "wrapper uses the shadowed scroller");
    assert.ok(src.includes("scorecard-table"), "table uses the compact phone rules");
    assert.ok(!/<(td|th)[^>]*px-2/.test(src), "cell padding comes from .scorecard-table (a utility would override the phone padding)");
  });
}

test("scorecard css: extras and total wrap, the scroller shows edge shadows, all in @layer components", () => {
  const start = css.indexOf(".scorecard-scroll {");
  assert.ok(start > 0);
  const block = css.slice(css.lastIndexOf("@layer components", start), start + 2500);
  assert.match(block, /\.scorecard-table tfoot td:not\(:first-child\) \{[^}]*white-space: normal/);
  assert.match(block, /\.scorecard-scroll \{[^}]*overflow-x: auto/);
  assert.match(block, /max-width: 399px/);
});

test("other cricket cards wrap names instead of truncating them", () => {
  for (const f of ["CricketPlayingXi", "CricketTopPerformers", "CricketPartnerships"]) {
    assert.ok(!/\btruncate\b/.test(read(`src/components/${f}.tsx`)), `${f} does not cut text with an ellipsis`);
  }
});

// Live check on a 375px phone: the 44px "503/9d" score squeezed the name column and line-clamp cut the last letter of
// "India" and "Lanka". The name column now never shrinks below its longest word and the score/name drop a size under 420px.
test("match hero: team names keep their longest word on phones", () => {
  const src = read("src/components/CricketMatchHero.tsx");
  assert.match(src, /flex min-w-min flex-col/);
  assert.match(src, /max-\[419px\]:text-\[18px\]/);
  assert.match(src, /max-\[419px\]:text-\[34px\]/);
});
