import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { JSDOM } from "jsdom";

const html = readFileSync("ops/room/index.html", "utf8");

const SECTIONS = ["today", "orders", "issues", "runs", "alerts", "crew", "stats", "rules", "office"];

// ---- the artifact contract ----

test("the page keeps the artifact contract", () => {
  assert.ok(!/<html|<head|<body|<!doctype/i.test(html), "no document skeleton");
  assert.ok(html.indexOf("<title>") >= 0 && html.indexOf("<title>") < 8192, "the title is in the first 8 KB");
  assert.match(html, /<title>Ops Room<\/title>/);
  assert.match(html, /:root\s*\{[^}]*--bg:/);
  assert.match(html, /@media \(prefers-color-scheme: dark\)\s*\{\s*:root:not\(\[data-theme="light"\]\)/);
  assert.match(html, /:root\[data-theme="dark"\]/);
  assert.match(html, /body\s*\{[^}]*background:\s*var\(--bg\)/);
  assert.match(html, /fonts\.googleapis\.com\/css2\?family=Nunito/);
  assert.ok(!/fetch\(|XMLHttpRequest/.test(html), "the page reads only its own database");
  assert.ok(!html.includes("—"), "no em-dashes");
});

test("external resources come only from the allowed hosts", () => {
  for (const m of html.matchAll(/<script[^>]+src="([^"]+)"/g)) assert.match(m[1], /^https:\/\/cdnjs\.cloudflare\.com\//, m[1]);
  for (const m of html.matchAll(/<link[^>]+href="([^"]+)"/g)) assert.match(m[1], /^https:\/\/fonts\.googleapis\.com\//, m[1]);
});

test("the page is readable on a phone", () => {
  // One gutter, set once on the content column, and nothing forced wider than
  // the screen. Wide things carry their own scroller.
  assert.match(html, /main \{[^}]*padding-inline: 16px/);
  assert.match(html, /@media \(max-width: 760px\)/);
  // A media query prelude is "(min-width: ...)"; a declaration is not.
  assert.ok(!/[^(]min-width:\s*(4[5-9]\d|[5-9]\d\d|\d{4,})px/.test(html), "nothing has a min-width wider than a phone");
  assert.match(html, /overflow-x: auto/);
});

test("every inline script parses", () => {
  const scripts = [...html.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  assert.ok(scripts.length >= 3);
  for (const s of scripts) new vm.Script(s);
});

// ---- Task 11: the shell, the sidebar, Today ----

test("the sidebar lists the sections in the reference's order with badges", () => {
  const sections = [...html.matchAll(/data-section="([a-z]+)"/g)].map((m) => m[1]);
  assert.deepEqual(sections, SECTIONS);
  assert.ok(/id="badge-orders"/.test(html) && /id="badge-issues"/.test(html));
  assert.ok(/<nav class="side"/.test(html));
  assert.ok(/id="side-toggle"/.test(html), "a menu button for phone width");
  // The sheet on a phone is the same list, not a second copy of it.
  assert.equal((html.match(/id="side-sheet"/g) ?? []).length, 1);
});

test("the sidebar names its groups and carries the site state", () => {
  for (const group of ["Work", "Log", "Team", "Knowledge", "Showcase"]) {
    assert.ok(html.includes(">" + group + "</p>"), group);
  }
  for (const label of ["Online, with notes", "Unknown"]) assert.ok(html.includes(label), label);
  assert.ok(/class="side-group"/.test(html));
});

test("every section is a panel with one heading and the hidden attribute", () => {
  for (const name of SECTIONS) {
    assert.ok(html.includes('data-panel="' + name + '" id="panel-' + name + '"'), name);
    assert.ok(html.includes('id="body-' + name + '"'), name + " body");
  }
  assert.equal((html.match(/<h1>/g) ?? []).length, SECTIONS.length, "one h1 per section");
  assert.ok(/panel.hidden = s !== to/.test(html), "sections are hidden with the hidden attribute");
  assert.ok(/aria-current", "page"/.test(html), "the active link says so");
});

test("the route is the hash, and today is the default", () => {
  assert.ok(/addEventListener\("hashchange"/.test(html));
  assert.ok(/location\.hash/.test(html));
  assert.ok(/nav\(this\.sections\.indexOf\(want\) >= 0 \? want : "today"/.test(html));
  for (const fn of ["renderToday", "renderOrders", "renderIssues", "renderRuns", "renderAlerts",
    "renderCrew", "renderStats", "renderRules", "renderOffice"]) {
    assert.ok(new RegExp(fn + "\\s*[(=]").test(html), fn);
  }
  assert.ok(/nav\s*\(name, quiet\)/.test(html), "nav(section) is the contract");
});

test("Today ranks what needs a decision and lists overnight rows", () => {
  assert.ok(/function renderToday\s*\(/.test(html) || /renderToday\s*\(root\)/.test(html));
  assert.ok(/needsDecision\s*\(/.test(html), "a helper that filters critical and high issues with no order, acknowledgement or snooze");
  assert.ok(/more than three days/.test(html), "the nudge banner copy");
  for (const block of ["Needs a decision", "Overnight", "Yesterday's numbers", "Sent to your phone"]) {
    assert.ok(html.includes(block), block);
  }
  // Every block says which collection it is waiting for.
  for (const waiting of ["Waiting for the issues list", "Waiting for the crew list",
    "Waiting for the daily readings", "Waiting for the alerts list"]) {
    assert.ok(html.includes(waiting), waiting);
  }
});

test("Today reads the whole status line and the reading time of each source", () => {
  for (const field of ["latencyMs", "productionCommit", "deployPending", "edgeStale", "checkedAt"]) {
    assert.ok(html.includes("s." + field), field);
  }
  assert.ok(/d\.readAt/.test(html), "each daily source's readAt time");
  for (const figure of ["game views", "top game", "GA4 users", "Search Console clicks"]) {
    assert.ok(html.includes(figure), figure);
  }
});

// ---- Task 12: ranking, actions, snooze, orders from a row ----

// The ranking is a pure function so it can be read on its own, the way the
// sanitizer is exercised against a real DOM below.
function pureHelper<T>(name: string): T {
  const src = new RegExp("\\nfunction " + name + "\\([\\s\\S]*?\\n\\}\\n").exec(html);
  assert.ok(src, name + " is a top level function");
  return new Function(src![0] + "\nreturn " + name + ";")() as T;
}

test("rankIssues groups by severity, newest first, and leaves the ignored ones out", () => {
  const rankIssues = pureHelper<(list: unknown[], now?: number) => Record<string, { key: string }[]>>("rankIssues");
  const now = Date.parse("2026-09-29T06:00:00Z");
  const day = 24 * 60 * 60 * 1000;
  const fixture = [
    { key: "a", severity: "medium", status: "open", lastSeen: "2026-09-28T01:00:00Z" },
    { key: "b", severity: "critical", status: "open", lastSeen: "2026-09-27T01:00:00Z" },
    { key: "c", severity: "critical", status: "reopened", lastSeen: "2026-09-29T01:00:00Z" },
    { key: "d", severity: "high", status: "open", lastSeen: "2026-09-28T09:00:00Z", snoozedUntil: new Date(now + 3 * day).toISOString() },
    { key: "e", severity: "low", status: "acknowledged", lastSeen: "2026-09-26T01:00:00Z" },
    { key: "f", severity: "high", status: "fixed", lastSeen: "2026-09-29T02:00:00Z" },
  ];
  const groups = rankIssues(fixture, now);
  assert.deepEqual(Object.keys(groups), ["critical", "high", "medium", "low"]);
  assert.deepEqual(groups.critical.map((i) => i.key), ["c", "b"], "newest lastSeen first");
  assert.deepEqual(groups.high.map((i) => i.key), [], "the snoozed one is out, and so is the fixed one");
  assert.deepEqual(groups.medium.map((i) => i.key), ["a"]);
  assert.deepEqual(groups.low.map((i) => i.key), ["e"], "acknowledged is still ranked");
  assert.ok(/window\.OpsRoom = OpsRoom/.test(html));
  assert.ok(/const groups = rankIssues\(all\)/.test(html), "the Issues section uses it");
});

test("needsDecision keeps the oldest unanswered critical and high issues", () => {
  const needsDecision = pureHelper<(list: unknown[], now?: number) => { key: string }[]>("needsDecision");
  const now = Date.parse("2026-09-29T06:00:00Z");
  const day = 24 * 60 * 60 * 1000;
  const list = needsDecision([
    { key: "old", severity: "critical", status: "open", firstSeen: "2026-09-20T01:00:00Z" },
    { key: "new", severity: "high", status: "open", firstSeen: "2026-09-28T01:00:00Z" },
    { key: "ordered", severity: "critical", status: "open", firstSeen: "2026-09-19T01:00:00Z", orderId: "20260929-101010-abcd" },
    { key: "acked", severity: "high", status: "acknowledged", firstSeen: "2026-09-18T01:00:00Z" },
    { key: "snoozed", severity: "critical", status: "open", firstSeen: "2026-09-17T01:00:00Z", snoozedUntil: new Date(now + day).toISOString() },
    { key: "quiet", severity: "medium", status: "open", firstSeen: "2026-09-10T01:00:00Z" },
  ], now);
  assert.deepEqual(list.map((i) => i.key), ["old", "new"]);
});

test("an order is a new document with the shape the Groundsman reads", () => {
  const src = /\nfunction newOrderId\([\s\S]*?\n\}\n[\s\S]*?\nfunction buildOrder\([\s\S]*?\n\}\n/.exec(html);
  assert.ok(src, "newOrderId and buildOrder are top level functions");
  const buildOrder = new Function(src![0] + "\nreturn buildOrder;")() as (
    kind: string, text: string, issueKey: string, createdBy: string, now?: Date,
  ) => Record<string, unknown>;
  const order = buildOrder("fix", "", "kit-manager:img-missing-dimensions-home", "owner", new Date("2026-09-29T14:35:07"));
  assert.deepEqual(Object.keys(order).sort(),
    ["attempts", "createdAt", "createdBy", "id", "issueKey", "kind", "status", "text"]);
  assert.match(String(order.id), /^\d{8}-\d{6}-[0-9a-f]{4}$/);
  assert.equal(order.status, "queued");
  assert.equal(order.attempts, 0);
  assert.equal(order.kind, "fix");
  assert.equal(order.issueKey, "kit-manager:img-missing-dimensions-home");
  assert.equal(order.createdBy, "owner");
  assert.ok(String(order.createdAt).endsWith("Z"));
  // Two orders in the same second still get their own id.
  const again = buildOrder("fix", "", "k", "owner", new Date("2026-09-29T14:35:07"));
  assert.match(String(again.id), /^\d{8}-\d{6}-[0-9a-f]{4}$/);
  assert.ok(/createOrder\(kind, text, issueKey\)/.test(html), "createOrder is the one writer");
  assert.ok(/db\.doc\("orders\/" \+ order\.id\)\.set\(order\)/.test(html), "a new order is set on its own id");
});

test("issues and runs renderers exist and issue writes go through update, never set", () => {
  assert.ok(/renderIssues\s*\(/.test(html) && /renderRuns\s*\(/.test(html));
  assert.ok(/doc\("issues\/" \+ [a-zA-Z]+\)\.update\(/.test(html), "issue status changes merge");
  assert.ok(!/doc\("issues\/[^)]*\)\.set\(/.test(html), "the page never replaces an issue document");
  for (const m of html.matchAll(/doc\("issues\/[^)]*\)\.([a-z]+)\(/g)) {
    assert.equal(m[1], "update", "every write to issues is an update");
  }
});

test("an issue row carries its rank, its history and every action", () => {
  for (const action of ["Fix", "Explain", "Recheck", "Acknowledge", "Ignore for", "Mark fixed"]) {
    assert.ok(html.includes('"' + action) || html.includes('"' + action + '"'), action);
  }
  assert.ok(/\.issue \{[^}]*border-left: 4px solid/.test(html), "a 4px severity stripe");
  assert.ok(/chip chip-agent/.test(html), "an agent chip");
  assert.ok(/days open|" open"/.test(html), "days open from firstSeen");
  assert.ok(/"seen " \+ this\.num\(occ\)/.test(html), "seen n times from occurrences");
  assert.ok(/"last seen " \+ this\.ago\(it\.lastSeen\)/.test(html));
  assert.ok(/"aria-expanded": shown \? "true" : "false"/.test(html), "the row expands as a button");
  assert.ok(/ownerNote: String\(text \|\| ""\)/.test(html), "the owner note is saved as an update");
  assert.ok(/snoozedUntil: new Date\(Date\.now\(\) \+ days \* DAY_MS\)/.test(html), "ignoring sets a return date");
  assert.ok(/status: "acknowledged"/.test(html), "and acknowledges at the same time");
  assert.ok(/orderFromIssue\(key, "fix"\)/.test(html) && /update\(\{ orderId: order\.id \}\)/.test(html),
    "an order given from a row is linked back to the issue");
  assert.ok(/Read the pull request/.test(html), "a finished order shows its pull request");
  assert.ok(/Ignored for now/.test(html) && /Fixed in the last 7 days/.test(html), "the two collapsed lists");
  assert.ok(/"back on " \+ this\.dayLabel\(it\.snoozedUntil\)/.test(html), "an ignored row says when it returns");
});

test("the Issues write buttons respect a read-only viewer", () => {
  assert.ok(/if \(this\.db && this\.canWrite\) \{\n\s+const notice = /.test(html), "issue actions need canWrite, like the Rulebook");
  assert.ok(/if \(this\.db && !this\.canWrite\)/.test(html), "and the viewer is told why they are missing");
});

// ---- kept from v1 ----

test("crew and rulebook renderers exist and rules are written as whole documents with an order", () => {
  assert.ok(/renderCrew\s*\(/.test(html) && /renderRules\s*\(/.test(html));
  assert.ok(html.includes('"Match officials"') && html.includes('"Front office"'));
  assert.ok(/collection\("rules"\)\.add\(/.test(html) || /doc\("rules\/" \+ [a-zA-Z]+\)\.set\(/.test(html));
  assert.ok(/order: max \+ 1/.test(html), "a new rule lands at the end of the list");
});

test("the Rulebook confirms a removal in the page, not in a modal", () => {
  assert.ok(!/window\.confirm\s*\(/.test(html), "modals are not reliable inside the artifact sandbox");
  assert.ok(html.includes("Confirm remove"), "the button asks for itself instead");
});

test("the office has a sprite for every crew member and draws in code only", () => {
  for (const id of ["physio", "umpire", "kit-manager", "analyst", "scout", "editor", "press-officer",
    "scorer", "steward", "owner", "session"]) {
    assert.ok(new RegExp(`"${id}":\\s*\\[`).test(html), id + " sprite");
  }
  assert.ok(!/<img/.test(html.split('id="panel-office"')[1] ?? ""), "no image files in the office");
  assert.ok(html.includes("image-rendering: pixelated"));
});

test("the office plays a 13-step day with the four controls and honours reduced motion", () => {
  const scene = html.split('id="panel-office"')[1] ?? "";
  assert.equal((html.match(/\{\s*at:\s*"\d\d:\d\d"/g) ?? []).length, 13, "13 steps");
  for (const id of ["clubhouse-pause", "clubhouse-restart", "clubhouse-day", "clubhouse-night", "clubhouse-caption"]) {
    assert.ok(scene.includes(`id="${id}"`), id);
  }
  assert.ok(html.includes("prefers-reduced-motion"));
  assert.ok(html.includes("visibilitychange"));
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
    OpsRoom: { markdownBlock(md: unknown): Element; cleanMarkdown(md: unknown): Element; sanitize(s: string): Node | null };
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
  assert.equal(ops.cleanMarkdown("<p>hi</p>").textContent, "hi", "cleanMarkdown is the same walk");
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
