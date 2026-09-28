import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { JSDOM } from "jsdom";

const html = readFileSync("ops/room/index.html", "utf8");

test("the page keeps the artifact contract", () => {
  assert.match(html.slice(0, 200), /^<title>Ops Room<\/title>/);
  assert.ok(!/<html|<head|<body|<!doctype/i.test(html), "no document skeleton");
  for (const id of ["tab-today", "tab-issues", "tab-runs", "tab-crew", "tab-rules", "tab-clubhouse"]) assert.ok(html.includes(`id="${id}"`), id);
  assert.match(html, /@media \(prefers-color-scheme: dark\)\s*\{\s*:root:not\(\[data-theme="light"\]\)/);
  assert.match(html, /:root\[data-theme="dark"\]/);
  assert.match(html, /body\s*\{[^}]*background:\s*var\(--bg\)/);
  assert.ok(!html.includes("—"), "no em-dashes");
});

test("external resources come only from the allowed hosts", () => {
  for (const m of html.matchAll(/<script[^>]+src="([^"]+)"/g)) assert.match(m[1], /^https:\/\/cdnjs\.cloudflare\.com\//, m[1]);
  for (const m of html.matchAll(/<link[^>]+href="([^"]+)"/g)) assert.match(m[1], /^https:\/\/fonts\.googleapis\.com\//, m[1]);
  assert.ok(!/fetch\(|XMLHttpRequest/.test(html), "the page reads only its own database");
});

test("every inline script parses", () => {
  const scripts = [...html.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  assert.ok(scripts.length >= 1);
  for (const s of scripts) new vm.Script(s);
});

test("issues and runs renderers exist and issue writes go through update, never set", () => {
  assert.ok(/renderIssues\s*\(/.test(html) && /renderRuns\s*\(/.test(html));
  assert.ok(/doc\("issues\/" \+ [a-zA-Z]+\)\.update\(/.test(html), "issue status changes merge");
  assert.ok(!/doc\("issues\/[^)]*\)\.set\(/.test(html), "the page never replaces an issue document");
});

test("the Markdown stripper works on a parsed document, not on attribute regexes", () => {
  assert.match(html, /new DOMParser\(\)\.parseFromString\(/, "hostile Markdown is parsed before it is cleaned");
  assert.ok(!/\\son\[a-z-\]\+/.test(html), "no whitespace-anchored on* attribute regex survives");
  // node has no DOM, so the lists are asserted as literals here and the behaviour
  // is proven in the browser: base, link, meta and style="" must not survive.
  assert.ok(html.includes('const drop = ["script", "style", "iframe", "object", "embed", "form", "base", "link", "meta", "use"];'),
    "base, link, meta and svg use are dropped with the script elements");
  assert.ok(html.includes('const strip = ["style", "srcdoc", "formaction"];'),
    "style, srcdoc and formaction attributes are removed");
});

test("crew and rulebook renderers exist and rules are written as whole documents with an order", () => {
  assert.ok(/renderCrew\s*\(/.test(html) && /renderRules\s*\(/.test(html));
  assert.ok(html.includes('"Match officials"') && html.includes('"Front office"'));
  assert.ok(/collection\("rules"\)\.add\(/.test(html) || /doc\("rules\/" \+ [a-zA-Z]+\)\.set\(/.test(html));
});

test("the clubhouse has a sprite for every crew member and draws in code only", () => {
  for (const id of ["physio","umpire","kit-manager","analyst","scout","editor","press-officer","scorer","steward","owner","session"]) assert.ok(new RegExp(`"${id}":\\s*\\[`).test(html), id + " sprite");
  assert.ok(!/<img/.test(html.split('id="panel-clubhouse"')[1] ?? ""), "no image files in the clubhouse");
  assert.ok(html.includes("image-rendering: pixelated"));
});

test("the clubhouse plays a 13-step day with the four controls and honours reduced motion", () => {
  const scene = html.split('id="panel-clubhouse"')[1] ?? "";
  assert.equal((html.match(/\{\s*at:\s*"\d\d:\d\d"/g) ?? []).length, 13, "13 steps");
  for (const id of ["clubhouse-pause", "clubhouse-restart", "clubhouse-day", "clubhouse-night", "clubhouse-caption"]) assert.ok(scene.includes(`id="${id}"`), id);
  assert.ok(html.includes("prefers-reduced-motion"));
  assert.ok(html.includes("visibilitychange"));
});

// The sanitizer is the one place untrusted Markdown becomes elements, so it is exercised against a
// real DOM rather than asserted as source text: the page's main inline script is evaluated inside a
// JSDOM window with the two globals it expects (window.claude, and marked stubbed to hand its input
// straight back, since the test feeds HTML in already).
function opsRoomWindow() {
  const scripts = [...html.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const main = scripts.find((s) => s.includes("window.OpsRoom = OpsRoom"));
  assert.ok(main, "the main script defines OpsRoom");
  const dom = new JSDOM("<!doctype html><title>t</title><body></body>", { runScripts: "outside-only" });
  const win = dom.window as unknown as {
    OpsRoom: { markdownBlock(md: unknown): Element; sanitize(s: string): Node | null };
    claude: unknown;
    marked: unknown;
    eval(code: string): unknown;
  };
  win.claude = { use: async () => null };
  win.marked = { parse: (s: string) => s };
  win.eval(main!);
  return win;
}

test("the sanitizer drops what can run and keeps what Markdown needs", () => {
  const ops = opsRoomWindow().OpsRoom;
  const box = (md: string) => ops.markdownBlock(md);

  const withImg = box('<img src="x" onerror="alert(1)">');
  const img = withImg.querySelector("img");
  assert.ok(img, "an image survives the walk");
  assert.equal(img!.hasAttribute("onerror"), false, "its handler does not");

  const jsLink = box('<a href="jav&#9;ascript:alert(1)">x</a>');
  assert.equal(jsLink.querySelector("a")!.hasAttribute("href"), false, "a tab-broken javascript: url is removed");

  assert.equal(box('<base href="https://evil.example/">').querySelector("base"), null, "base cannot move the page");
  assert.equal(box('<p style="color:red">hi</p>').querySelector("p")!.hasAttribute("style"), false, "inline style is stripped");

  const svg = box("<svg><script>1</script></svg>");
  assert.equal(svg.querySelector("svg"), null, "svg is not something Markdown produces");
  assert.equal(svg.querySelector("script"), null, "and its script is gone");

  const blank = box('<a href="https://sports-db.live" target="_blank">x</a>');
  assert.equal(blank.querySelector("a")!.getAttribute("rel"), "noopener noreferrer", "a new tab cannot reach back");

  const unwrapped = box("<marquee>words <b>kept</b></marquee>");
  assert.equal(unwrapped.querySelector("marquee"), null, "an element off the allowlist is unwrapped");
  assert.ok(unwrapped.textContent!.includes("words kept"), "its words survive");

  assert.ok(ops.sanitize("<p>hi</p>")!.nodeType === 1, "sanitize hands back nodes, never a string to re-parse");
});

test("a runaway details block is truncated instead of rendered whole", () => {
  const ops = opsRoomWindow().OpsRoom;
  const box = ops.markdownBlock("x".repeat(40_000));
  const text = box.textContent ?? "";
  assert.ok(text.length > 16_000 && text.length < 17_000, `truncated near 16k, got ${text.length}`);
  assert.ok(text.includes("details truncated"), "and says so");
});

test("the page never assigns markup to a live element", () => {
  assert.ok(!html.includes("innerHTML"), "no innerHTML anywhere in the page");
});

test("the Rulebook confirms a removal in the page, not in a modal", () => {
  assert.ok(!/window\.confirm\s*\(/.test(html), "modals are not reliable inside the artifact sandbox");
  assert.ok(html.includes("Confirm remove"), "the button asks for itself instead");
});

test("the Issues write buttons respect a read-only viewer", () => {
  assert.ok(/if \(this\.db && this\.canWrite\) \{\n\s+const notice = /.test(html), "issue actions need canWrite, like the Rulebook");
});
