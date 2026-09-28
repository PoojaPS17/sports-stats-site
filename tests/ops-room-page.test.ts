import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

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
