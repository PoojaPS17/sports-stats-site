import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// Tailwind v4 puts its utilities in `@layer utilities`; a rule outside every layer beats them no
// matter how it is written, so a component class in plain CSS silently overrode the utilities
// written next to it (`first:border-t-0`, `leading-none`) and the fix was the `!` modifier.
// Component rules now live in `@layer components`, base rules in `@layer base`; the only rules
// left unlayered are the tokens on :root and the state rules keyed on <html data-*>, which must
// beat utilities on purpose.

const root = join(__dirname, "..");
const css = readFileSync(join(root, "src/app/globals.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

/** Top-level statements of a stylesheet: [prelude, body] for blocks, [text, null] for at-rules without one. */
function topLevel(sheet: string): [string, string | null][] {
  const out: [string, string | null][] = [];
  let depth = 0;
  let start = 0;
  let preludeEnd = -1;
  for (let i = 0; i < sheet.length; i++) {
    const ch = sheet[i];
    if (ch === "{") {
      if (depth === 0) preludeEnd = i;
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) {
        out.push([sheet.slice(start, preludeEnd).trim(), sheet.slice(preludeEnd + 1, i)]);
        start = i + 1;
      }
    } else if (ch === ";" && depth === 0) {
      out.push([sheet.slice(start, i).trim(), null]);
      start = i + 1;
    }
  }
  return out.filter(([p]) => p.length > 0);
}

const selectorsOf = (prelude: string) => prelude.split(",").map((s) => s.trim());
const isTokenOrState = (selector: string) => /^:root\b/.test(selector) || /^\.home-(skeleton|collapsed-bar|else)$/.test(selector);

test("globals.css keeps every rule inside a layer, except the :root tokens and the data-* state rules", () => {
  const statements = topLevel(css);
  const unlayered: string[] = [];
  for (const [prelude, body] of statements) {
    if (/^@(import|theme|keyframes|layer)\b/.test(prelude)) continue;
    if (prelude.startsWith("@media")) {
      // A top-level media query may only hold token blocks (the dark theme).
      for (const [inner] of topLevel(body ?? "")) {
        if (!selectorsOf(inner).every(isTokenOrState)) unlayered.push(`${prelude} { ${inner} }`);
      }
      continue;
    }
    if (prelude.startsWith("@")) {
      unlayered.push(prelude);
      continue;
    }
    if (!selectorsOf(prelude).every(isTokenOrState)) unlayered.push(prelude);
  }
  assert.deepEqual(unlayered, [], "rules outside @layer base / @layer components");
});

test("base and component layers hold what they should", () => {
  const layers = new Map<string, string>();
  for (const [prelude, body] of topLevel(css)) {
    if (prelude.startsWith("@layer ") && body !== null) layers.set(prelude.slice(7).trim(), (layers.get(prelude.slice(7).trim()) ?? "") + body);
  }
  assert.match(layers.get("base") ?? "", /\bbody\s*\{/, "body styles sit in @layer base");
  assert.match(layers.get("base") ?? "", /\.grid > \*/, "the grid-item minimum stays in @layer base");
  const components = layers.get("components") ?? "";
  for (const cls of [".card", ".nav-pill", ".table-row", ".display", ".eyebrow", ".band", ".strip-chip", ".art"]) {
    assert.match(components, new RegExp(`${cls.replace(".", "\\.")}[\\s,:{]`), `${cls} is in @layer components`);
  }
  assert.doesNotMatch(components, /\[data-home|\[data-topic/, "state rules stay out of the components layer");
});

/** Every .tsx file under src. */
function tsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...tsxFiles(p));
    else if (name.endsWith(".tsx")) out.push(p);
  }
  return out;
}

test("no className needs the ! important modifier any more", () => {
  const offenders: string[] = [];
  for (const file of tsxFiles(join(root, "src"))) {
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
      const classes = (m[1] ?? m[2] ?? "").replace(/\$\{[^}]*\}/g, " ");
      for (const token of classes.split(/\s+/)) {
        if (token.length > 1 && token.endsWith("!")) offenders.push(`${file.slice(root.length + 1)}: ${token}`);
      }
    }
  }
  assert.deepEqual(offenders, []);
});

test("the root clips sideways overflow, because the header row is wider than a 360-375px phone", () => {
  // `overflow-x: clip` on <body> alone leaves the document scrollable sideways (4px at 375px, 19px at 360px);
  // it has to be on <html>. `clip`, not `hidden`, so the sticky header keeps working.
  assert.match(css, /@layer base\s*\{\s*html\s*\{[^}]*overflow-x:\s*clip/);
});
