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
