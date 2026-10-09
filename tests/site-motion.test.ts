import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// The owner approved a fixed set of motion for the site: card lift, press feedback, staggered entrance, reorder and
// remove, sliding tab underline, score flash, bars growing in, number count-up, hero drift, button lift and the add-block
// pulse. A tab-content crossfade and a live-dot ping were shown and NOT approved. This pins the set: what is allowed to move,
// what it may animate, how it switches off, and that nothing outside the set sneaks in.

const root = join(__dirname, "..");
const full = readFileSync(join(root, "src/app/globals.css"), "utf8");
const marker = full.indexOf("Site motion: the owner-approved set");
assert.ok(marker > 0, "the motion block exists");
const start = full.lastIndexOf("/*", marker);
const motion = full.slice(start);
const code = motion.replace(/\/\*[\s\S]*?\*\//g, "");

/** The body of the `{ ... }` that opens at `from` (balanced). */
function body(src: string, from: number): string {
  const open = src.indexOf("{", from);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return src.slice(open + 1, i);
  }
  throw new Error("unbalanced");
}

const keyframes = [...code.matchAll(/@keyframes\s+([\w-]+)/g)].map((m) => ({ name: m[1], text: body(code, m.index!) }));
const reduced = body(code, code.indexOf("@media (prefers-reduced-motion: reduce)"));

test("the motion block is one components-layer block with tokens only: no colour literals", () => {
  assert.match(motion, /^\/\*[\s\S]*?\*\/\s*@layer components \{/, "the block opens its own components layer right after its comment");
  assert.doesNotMatch(motion, /#[0-9a-fA-F]{3,8}\b/);
  assert.doesNotMatch(motion, /rgba?\(|hsla?\(|oklch\(/);
  assert.doesNotMatch(motion, /\b(?:white|black|red|green|blue|orange)\b\s*[;,)]/);
});

test("every keyframe animates transform or opacity and nothing else", () => {
  const names = keyframes.map((k) => k.name).sort();
  assert.deepEqual(names, ["add-pulse", "bar-grow", "block-leave", "hero-drift", "motion-enter", "score-flash"]);
  for (const k of keyframes) {
    const props = new Set([...k.text.matchAll(/([a-z-]+)\s*:/g)].map((m) => m[1]));
    for (const p of props) assert.ok(p === "transform" || p === "opacity", `@keyframes ${k.name} sets ${p}`);
  }
});

test("only transform, opacity, scale and the named shadow and edge ease in transitions", () => {
  const allowed = new Set(["transform", "opacity", "scale", "box-shadow", "border-color", "background-color", "color"]);
  for (const m of code.matchAll(/transition:\s*([^;]+);/g)) {
    for (const part of m[1].split(/,(?![^(]*\))/)) {
      const prop = part.trim().split(/\s+/)[0];
      if (prop === "none") continue;
      assert.ok(allowed.has(prop), `transition on ${prop}`);
    }
  }
});

test("the staggered entrance covers the first eight children, 45ms apart, as a plain CSS animation", () => {
  assert.match(code, /\.motion-stagger > :nth-child\(-n \+ 8\)/);
  assert.match(code, /animation-delay:\s*calc\(var\(--i, 0\) \* 45ms\)/);
  const indices = [...code.matchAll(/\.motion-stagger > :nth-child\((\d+)\)\s*\{\s*--i:\s*(\d+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
  assert.deepEqual(indices, [2, 3, 4, 5, 6, 7, 8].map((n) => [n, n - 1]), "child n has index n-1, and nothing past the eighth has one");
  // `backwards` and not `both`: nothing is left holding the end state, and a finished entrance leaves no transform behind.
  assert.match(code, /animation:\s*motion-enter 0\.35s var\(--motion-ease\) backwards/);
  // The built home's blocks decide at mount whether they are among the first eight, so a reorder replays nothing.
  const frame = readFileSync(join(root, "src/components/home/BlockFrame.tsx"), "utf8");
  assert.match(frame, /useState\(\(\) => \(index < 8 \? index : -1\)\)/);
});

test("the card lift leaves the hover edge colour alone", () => {
  const hover = code.match(/a\.card:hover,[^{]*\{([^}]*)\}/);
  assert.ok(hover, "the lift rule exists");
  assert.match(hover![1], /transform:\s*translateY\(-3px\)/);
  assert.doesNotMatch(hover![1], /border-color|border:|outline/);
  assert.match(code, /a\.card:active,[^{]*\{\s*scale:\s*0\.98/);
  assert.match(code, /button:not\(:disabled\):active,[^{]*\{\s*scale:\s*0\.96/);
});

test("reduced motion switches off every class the block adds", () => {
  const classes = [".motion-stagger", ".motion-enter", ".block-leaving", ".bar-grow", ".score-flash", ".add-block", ".home-decor-built .hd-glow", ".home-decor-built .hd-dot", ".btn-lift", ".slide-host[data-ind=\"go\"]", "a.card", ".nav-pill", ".scores-chip"];
  for (const c of classes) assert.ok(reduced.includes(c), `${c} is covered by the reduced-motion block`);
  assert.match(reduced, /animation:\s*none !important/);
  assert.match(reduced, /transition:\s*none !important/);
  assert.match(reduced, /\.bar-grow\[data-bar-wait\][^{]*\{\s*transform:\s*none !important/, "a parked bar shows its final state");
  // The sliding underline keeps its place under reduced motion: only its glide goes.
  const slideRule = reduced.match(/[^{}]*\.slide-host\[data-ind="go"\][^{]*\{([^}]*)\}/);
  assert.ok(slideRule);
  assert.doesNotMatch(slideRule![1], /transform/);
});

test("scripts that animate check the reduced-motion setting too", () => {
  for (const f of ["CountUp.tsx", "BarReveal.tsx", "ScoreFlash.tsx", "useFlip.ts"]) {
    assert.match(readFileSync(join(root, "src/components/motion", f), "utf8"), /prefersReducedMotion\(\)/, f);
  }
  assert.match(readFileSync(join(root, "src/components/home/HomeBlocks.tsx"), "utf8"), /prefersReducedMotion\(\)/);
});

test("the count-up never changes the number: the server text is the value, and the count ends on it", () => {
  const src = readFileSync(join(root, "src/components/motion/CountUp.tsx"), "utf8");
  assert.match(src, /\{value\}\s*<\/span>/, "the rendered text is the value itself");
  assert.match(src, /: value;/, "the last step writes the value, not a rounded float");
  const flash = readFileSync(join(root, "src/components/motion/ScoreFlash.tsx"), "utf8");
  assert.match(flash, /\{children\}/);
  assert.doesNotMatch(flash, /textContent|innerText|\.data\s*=/, "the flash only toggles a class");
});

test("motion is limited to the approved set: no tab crossfade, no live-dot ping", () => {
  assert.doesNotMatch(code, /crossfade|tab-fade|pane-fade|\.live-ping|\.ping|@keyframes\s+(?:ping|fade)\b/i);
  assert.doesNotMatch(code, /\.live-dot|\.pulse-dot|\[role="tabpanel"\]/, "the motion block does not touch the live dot or the tab panels");
  const files: string[] = [];
  const walk = (d: string) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(tsx|ts)$/.test(n)) files.push(p);
    }
  };
  walk(join(root, "src"));
  for (const f of files) {
    const s = readFileSync(f, "utf8");
    assert.doesNotMatch(s, /animate-ping|tab-crossfade|motion-crossfade/, f);
  }
});
