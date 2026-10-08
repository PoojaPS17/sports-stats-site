import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// A playoff pill reads "NL Championship Series - Game 1 · Sun, Oct 11". `.pill` is nowrap, so on a card
// the pill ran past the edge, the card clipped it mid-word and the kickoff time beside it was pushed out of view.
// StatusPill now opts into `.pill-wrap` (may shrink and wrap), and the card keeps its right-hand time unshrinkable.

const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");
const css = read("src/app/globals.css");

test(".pill-wrap lets the pill shrink and wrap instead of staying on one line", () => {
  const rule = css.match(/\.pill-wrap\s*\{([^}]*)\}/)?.[1] ?? "";
  assert.match(rule, /min-width:\s*0/);
  assert.match(rule, /max-width:\s*100%/);
  assert.match(rule, /white-space:\s*normal/);
});

test(".pill-wrap sits inside @layer components, after .pill so it wins", () => {
  assert.ok(css.indexOf(".pill-wrap") > css.indexOf(".pill {"));
});

test("every StatusPill variant carries pill-wrap", () => {
  const src = read("src/components/StatusPill.tsx");
  const pills = src.match(/className="pill [^"]*"/g) ?? [];
  assert.equal(pills.length, 4);
  for (const p of pills) assert.match(p, /pill-wrap/);
});

test("the stage and the kickoff are one flex item so they wrap together", () => {
  const src = read("src/components/StatusPill.tsx");
  assert.match(src, /<span>\s*\{round \? `\$\{round\} · ` : ""\}\s*<Kickoff/);
});

test("a GameCard's right-hand time/date cannot shrink or wrap", () => {
  const src = read("src/components/GameCard.tsx");
  const row = src.slice(src.indexOf("<StatusPill"), src.indexOf("{rows[order[0]]}"));
  const right = row.slice(row.indexOf("/>") + 2);
  const classes = right.match(/className="[^"]*"/g) ?? [];
  assert.equal(classes.length, 3);
  for (const c of classes) assert.match(c, /shrink-0 whitespace-nowrap/);
});
