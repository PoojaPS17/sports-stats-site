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
    // Ignoring an issue acknowledges it, so once the date it was ignored until
    // has passed it has to be asked about again or it never comes back.
    { key: "woke", severity: "critical", status: "acknowledged", firstSeen: "2026-09-19T12:00:00Z", snoozedUntil: new Date(now - day).toISOString() },
    { key: "closed", severity: "critical", status: "fixed", firstSeen: "2026-09-16T01:00:00Z", snoozedUntil: new Date(now - day).toISOString() },
  ], now);
  assert.deepEqual(list.map((i) => i.key), ["woke", "old", "new"]);
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

// ---- Task 13: Orders, Runs, Alerts ----

test("the three log sections have renderers of their own", () => {
  for (const fn of ["renderOrders", "renderRuns", "renderAlerts"]) {
    assert.ok(new RegExp("\\n  " + fn + "\\(root\\) \\{").test(html), fn);
  }
});

test("the compose box offers the four kinds, a text field and an issue picker", () => {
  assert.ok(html.includes('const ORDER_KINDS = [["fix", "Fix"], ["explain", "Explain"], ["recheck", "Recheck"], ["custom", "Custom"]];'),
    "four kinds, in the order the box offers them");
  assert.ok(/"aria-pressed": draft\.kind === id \? "true" : "false"/.test(html), "the chosen kind is the pressed one");
  assert.ok(html.includes('h("select", { id: "order-issue" })'), "the issue picker is a select");
  assert.ok(html.includes('h("option", { value: "", text: "No issue" })'), "with a way to name no issue");
  assert.ok(/pickableIssues\(\)/.test(html), "and it lists the issues still worth an order");
  assert.ok(/if \(status !== "open" && status !== "reopened" && status !== "acknowledged"\) continue;/.test(html),
    "open, seen again and acknowledged");
  assert.ok(html.includes('id: "order-text"'), "a text field");
  assert.ok(html.includes("A custom order needs your words."), "which a custom order cannot go without");
  assert.ok(/this\.sendOrder\(draft\.kind, text, select\.value\)/.test(html), "Send hands over the three answers");
  assert.ok(html.includes("return this.createOrder(kind, text, key)") && html.includes('return this.createOrder(kind, text, "")'),
    "and sendOrder is a call to createOrder");
  assert.ok(html.includes('area.value = "";') && html.includes('select.value = "";'), "the form is cleared afterwards");
  assert.ok(html.includes("The Groundsman checks for orders every hour between 08:35 and 22:35 IST. To run it now, open its routine and press Run."),
    "the note under the box");
  assert.ok(/} else if \(this\.db\) \{\n      kids\.push\(this\.composeBox\(\)\);/.test(html), "writing needs a database");
  assert.ok(html.includes("You are signed in as a viewer, so the box for giving an order is hidden."),
    "and a viewer is told why the box is missing");
});

test("an order can be called off only while it is queued", () => {
  assert.ok(/if \(status === "queued" && this\.db && this\.canWrite\) \{/.test(html), "the Cancel button is guarded");
  assert.ok(html.includes('"Cancel this order"'));
  assert.ok(html.includes('db.doc("orders/" + id).update({ status: "cancelled", finishedAt: new Date().toISOString() });'),
    "and cancelling is an update, not a delete");
});

test("the orders list is grouped, and a row opens the result with its links", () => {
  assert.ok(html.includes('const ORDER_GROUPS = [["queued", "Queued"], ["running", "Running"], ["done", "Done"], ["failed", "Failed"]];'));
  assert.ok(/const into = status === "cancelled" \? "failed"/.test(html), "a cancelled order is folded under Failed");
  assert.ok(/ORDER_WORDS\[status\] \|\| status/.test(html), "and keeps a chip that says cancelled");
  assert.ok(/orderList\(\)/.test(html) && /\(Date\.parse\(b\.createdAt\) \|\| 0\) - \(Date\.parse\(a\.createdAt\) \|\| 0\)/.test(html),
    "newest first");
  assert.ok(html.includes("this.markdownBlock(o.result)"), "the result goes through the sanitizer");
  assert.ok(html.includes("const pr = this.safeUrl(o.prUrl);") && html.includes("const session = this.safeUrl(o.sessionUrl);"),
    "both links are checked before they are shown");
  assert.ok(html.includes("/^https?:\\/\\//i.test(s)"), "and only an http or https link is shown");
  assert.ok(html.includes("Read the pull request") && html.includes("Open the session log"));
  assert.ok(html.includes("this.orderKind(o.kind)") && html.includes("this.orderWhen(o)"),
    "each row carries its kind and when it was given");
  assert.ok(html.includes("Nothing in orders yet."), "the empty state names the collection");
});

test("Runs keeps the fourteen, the sanitizer, the limit and a remembered filter", () => {
  assert.ok(html.includes("if (seen[agent] > 14) continue;"), "the last fourteen runs per agent");
  assert.ok(html.includes("if (this.has(r.details)) body.append(this.markdownBlock(r.details));"),
    "a run's details go through the sanitizer");
  assert.ok(html.includes("const cut = text.length > DETAILS_LIMIT;"), "and the limit still cuts a runaway block");
  assert.ok(html.includes('const RUNS_FILTER_KEY = "ops-room.runs-agent";'));
  assert.ok(/readFilter\(\) \{\n    try \{\n      const saved = window\.localStorage\.getItem\(RUNS_FILTER_KEY\);/.test(html),
    "reading the remembered filter is wrapped");
  assert.ok(/setRunsAgent\(id\) \{[\s\S]{0,400}?try \{[\s\S]{0,300}?window\.localStorage\.setItem\(RUNS_FILTER_KEY/.test(html),
    "and so is writing it");
  assert.ok(html.includes('this.agentChip("All", null, !sel)'), "All, plus one chip per crew member");
});

test("Alerts shows 30 days of pushes with their kind and the issues they named", () => {
  assert.ok(html.includes("const cutoff = Date.now() - 30 * DAY_MS;"));
  for (const kind of ["new-critical", "new-high", "digest", "reminder"]) assert.ok(html.includes(kind), kind);
  assert.ok(html.includes("this.alertTitles(a)"), "the keys it named are read back as titles");
  assert.ok(html.includes("out.push(issue && this.has(issue.title) ? String(issue.title) : key);"),
    "with the key itself as the fallback");
  assert.ok(html.includes("text: this.stamp(a.sentAt)"), "the time is the viewer's own clock");
  assert.ok(html.includes("Nothing in alerts for the last 30 days."), "the empty state names the collection");
});

// ---- Task 14: Crew, Stats, Rulebook ----

test("Crew is split by kind, keeps the dugout, and links to the routine", () => {
  assert.ok(html.includes('(String(c.kind || "actor") === "actor" ? actors : reporters)')
    || html.includes('(String(c.kind || "reporter") === "actor" ? actors : reporters)'),
    "a crew document with no kind is a reporter");
  assert.ok(html.includes('this.crewBlock("Reporters", reporters,'));
  assert.ok(html.includes('this.crewBlock("The Groundsman", actors,'));
  assert.ok(html.includes('"Dugout"'), "and the two of us keep a heading of our own");
  assert.ok(html.includes('"https://claude.ai/code/routines/" + encodeURIComponent(String(c.routineId))'),
    "the card links to the routine");
  assert.ok(html.includes("Open the routine"));
  for (const fact of ["Job", "Never", "When", "Tonight"]) {
    assert.ok(html.includes('h("dt", { text: "' + fact + '" })'), fact);
  }
  assert.ok(/const panel = h\("div", \{ class: "crew-panel", hidden: !shown \}/.test(html),
    "the card opens where the row is");
  assert.ok(/class: "crew-open", "aria-expanded": shown \? "true" : "false"/.test(html), "and says so");
  assert.ok(html.includes("Waiting for the crew list."), "the empty state names the collection");
});

test("Stats draws its own SVG and the page loads no chart library", () => {
  const srcs = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(srcs, ["https://cdnjs.cloudflare.com/ajax/libs/marked/12.0.2/marked.min.js"],
    "marked is the only script the page loads");
  for (const lib of ["chart.js", "chartjs", "d3.v", "d3.min", "plotly", "echarts", "highcharts", "apexcharts", "recharts"]) {
    assert.ok(!html.toLowerCase().includes(lib), lib);
  }
  const stats = html.slice(html.indexOf("  renderStats(root) {"), html.indexOf("  // ---- Runs ----"));
  assert.ok(stats.length > 2000, "the Stats renderer is in the main script");
  assert.ok(html.includes('const SVG_NS = "http://www.w3.org/2000/svg";'));
  assert.ok(stats.includes("document.createElementNS(SVG_NS, tag)"), "every shape is made in the SVG namespace");
  assert.ok(!stats.includes("canvas"), "and nothing in Stats is drawn on a canvas");
  assert.ok(stats.includes('viewBox: "0 0 " + f.w + " " + (base + 26)'), "a viewBox with room for the outermost labels");
  for (const field of ["gameViews", "ga4Users", "gscClicks", "gscIndexed"]) {
    assert.ok(stats.includes('"' + field + '"'), field);
  }
  assert.ok(stats.includes("this.severityChart(anchor)") && stats.includes("counts[this.severityOf(issue)] += 1;"),
    "and one stacked bar of open issues by severity");
  // Every mark and every word inside a drawing wears a token, in both themes.
  for (const rule of ["ch-grid", "ch-line", "ch-dot", "ch-text", "ch-critical", "ch-high", "ch-medium", "ch-low"]) {
    assert.ok(new RegExp("\\." + rule + " \\{[^}]*var\\(--").test(html), rule);
  }
  assert.ok(stats.includes("on 7 days earlier"), "the delta against a week ago");
  assert.ok(stats.includes("if (values[i] === null) { flush(); continue; }"), "a day nobody read is a gap, not a zero");
  assert.ok(stats.includes("Not enough readings yet.") && stats.includes("Not enough runs yet."),
    "an empty state for each chart");
  assert.ok(stats.includes("Waiting for the daily readings.") && stats.includes("Waiting for the runs list."),
    "naming the collection each one waits for");
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
    "scorer", "steward", "owner", "session", "groundsman"]) {
    assert.ok(new RegExp(`"${id}":\\s*\\[`).test(html), id + " sprite");
  }
  assert.ok(!/<img/.test(html.split('id="panel-office"')[1] ?? ""), "no image files in the office");
  assert.ok(html.includes("image-rendering: pixelated"));
});

test("the office plays a 14-step day with the four controls and honours reduced motion", () => {
  const scene = html.split('id="panel-office"')[1] ?? "";
  assert.equal((html.match(/\{\s*at:\s*"\d\d:\d\d"/g) ?? []).length, 14, "14 steps");
  assert.ok(html.includes('"Step " + (this.step + 1) + " of " + this.STEPS.length'), "the caption counts them");
  assert.ok(html.includes("The owner gives an order; the Groundsman collects it and comes back with a pull request"),
    "the fourteenth step's caption");
  for (const id of ["clubhouse-pause", "clubhouse-restart", "clubhouse-day", "clubhouse-night", "clubhouse-caption"]) {
    assert.ok(scene.includes(`id="${id}"`), id);
  }
  assert.ok(html.includes("prefers-reduced-motion"));
  assert.ok(html.includes("visibilitychange"));
});

// The floor map is a plain object literal, so it is read out of the page and
// evaluated on its own, the way rankIssues is above.
test("the Groundsman works on the pitch, below every other floor", () => {
  const src = /\n  FLOOR: (\{[\s\S]*?\n  \}),\n/.exec(html);
  assert.ok(src, "the floor map is a plain object literal");
  const floor = new Function("return " + src![1] + ";")() as Record<string, { x: number; y: number }>;
  const others = Object.keys(floor).filter((id) => id !== "groundsman");
  assert.ok(floor.groundsman, "the Groundsman has a mark of his own");
  assert.equal(others.length, 11, "and the other eleven keep theirs");
  for (const id of others) {
    assert.ok(floor.groundsman.y > floor[id].y, "the Groundsman stands below " + id);
  }
  assert.ok(html.includes('data-figure="groundsman"'), "a chip in the figure list picks him out");
  assert.ok(html.includes('if (String(o.status || "") === "running") return true;'),
    "and his lamp follows a running order");
  assert.ok(html.includes("const lit = this.orderRunning();"), "which is what the lamp asks");
});

test("the office card is the Crew section's card, not a second one", () => {
  const office = html.slice(html.indexOf("// ---- The Office ----"));
  assert.ok(office.length > 10_000, "the Office script block was found");
  assert.ok(office.includes("OpsRoom.crewCard(d, true)") && office.includes("OpsRoom.crewCard(c, false)"),
    "the Office builds its card with the Crew section's crewCard");
  assert.ok(!office.includes('h("dl", { class: "crew-facts" }'), "and does not build a rival one");
});

test("the Markdown stripper works on a parsed document, not on attribute regexes", () => {
  assert.match(html, /new DOMParser\(\)\.parseFromString\(/, "hostile Markdown is parsed before it is cleaned");
  assert.ok(!/\\son\[a-z-\]\+/.test(html), "no whitespace-anchored on* attribute regex survives");
  // node has no DOM, so the lists are asserted as literals here and the behaviour
  // is proven in the browser: base, link, meta and style="" must not survive.
  assert.ok(html.includes('const drop = ["script", "style", "iframe", "object", "embed", "form", "base", "link", "meta", "use", "img"];'),
    "base, link, meta, svg use and images are dropped with the script elements");
  assert.ok(/if \(!this\.safeUrl\(url\)\) el\.removeAttribute\(attr\.name\);/.test(html),
    "href, src and xlink:href are judged by safeUrl, not by a list of bad schemes");
  assert.ok(html.includes('const strip = ["style", "srcdoc", "formaction"];'),
    "style, srcdoc and formaction attributes are removed");
});

// The sanitizer is the one place untrusted Markdown becomes elements, so it is exercised against a
// real DOM rather than asserted as source text: the page's main inline script is evaluated inside a
// JSDOM window with the two globals it expects (window.claude, and marked stubbed to hand its input
// straight back, since the test feeds HTML in already).
type Row = Record<string, unknown>;

interface OpsRoomPage {
  markdownBlock(md: unknown): Element;
  sanitize(s: string): Node | null;
  db: unknown;
  state: {
    crew: Record<string, Row>;
    issues: Record<string, Row>;
    runs: Record<string, Row>;
    orders: Record<string, Row>;
    daily: Record<string, Row>;
    dbReady: boolean | null;
    failed: Record<string, string>;
  };
  drafts: Record<string, string>;
  h(tag: string, attrs?: Record<string, unknown>): Element;
  subscribe(): void;
  noteBox(key: string, value: unknown, notice: Element): Element;
  cancelOrder(id: string): Promise<unknown>;
  chartAnchor(): string;
  statsDays(anchor?: string): { date: string }[];
  severityDays(anchor?: string): { date: string }[];
  snoozedList(all: Row[]): Element;
  todayOvernight(): Element;
  todayActors(): Element | null;
}

interface OpsRoomWindow {
  OpsRoom: OpsRoomPage;
  claude: unknown;
  marked: unknown;
  Event: { new (type: string): Event };
  eval(code: string): unknown;
}

function opsRoomWindow(): OpsRoomWindow {
  const scripts = [...html.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const main = scripts.find((s) => s.includes("window.OpsRoom = OpsRoom"));
  assert.ok(main, "the main script defines OpsRoom");
  const dom = new JSDOM("<!doctype html><title>t</title><body></body>", { runScripts: "outside-only" });
  const win = dom.window as unknown as OpsRoomWindow;
  win.claude = { use: async () => null };
  win.marked = { parse: (s: string) => s };
  win.eval(main!);
  return win;
}

test("the sanitizer drops what can run and keeps what Markdown needs", () => {
  const ops = opsRoomWindow().OpsRoom;
  const box = (md: string) => ops.markdownBlock(md);

  // The page shows no pictures, and an image in an agent's Markdown would be an
  // outbound request to whatever host the text named, so the element goes.
  assert.equal(box('<img src="x" onerror="alert(1)">').querySelector("img"), null, "an image does not survive the walk");
  assert.equal(box('<img src="https://x/pixel.png">').querySelector("img"), null, "nor does one that names a real host");

  const jsLink = box('<a href="jav&#9;ascript:alert(1)">x</a>');
  assert.equal(jsLink.querySelector("a")!.hasAttribute("href"), false, "a tab-broken javascript: url is removed");

  // A list of bad schemes always misses one, so an address has to prove it is
  // http or https instead.
  for (const bad of ["vbscript:msgbox(1)", "file:///etc/passwd", "data:text/html,<b>x", "javascript:alert(1)"]) {
    const link = box('<a href="' + bad + '">x</a>').querySelector("a");
    assert.equal(link!.hasAttribute("href"), false, bad + " is not a link this page will write");
  }
  assert.equal(box('<a href="https://sports-db.live/x">x</a>').querySelector("a")!.getAttribute("href"),
    "https://sports-db.live/x", "an https link is kept whole");
  assert.equal(box('<a href="#heading">x</a>').querySelector("a")!.getAttribute("href"), "#heading",
    "and so is a link inside the same block");

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
  assert.equal(ops.markdownBlock("<p>hi</p>").textContent, "hi", "markdownBlock is the one way in");
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

// ---- the review's fixes ----

// A collection nobody has written yet can throw where it is asked for, and
// orders and alerts do not exist before the Groundsman's first run.
interface FakeQuery {
  where(...a: unknown[]): FakeQuery;
  orderBy(...a: unknown[]): FakeQuery;
  limit(n: number): FakeQuery;
  onSnapshot(next: unknown, fail: unknown): void;
}

function fakeDb(throwsOn: string, opened: string[]) {
  const chain = (name: string): FakeQuery => {
    const q: FakeQuery = {
      where: () => q,
      orderBy: () => q,
      limit: () => q,
      onSnapshot: () => {
        if (name === throwsOn) throw Object.assign(new Error("no such collection"), { code: "not-found" });
        opened.push(name);
      },
    };
    return q;
  };
  return { collection: (name: string) => chain(name), doc: (path: string) => chain(path) };
}

test("one collection that will not open costs the page only that collection", () => {
  const ops = opsRoomWindow().OpsRoom;
  const opened: string[] = [];
  ops.db = fakeDb("orders", opened);
  ops.subscribe();
  assert.deepEqual(opened, ["crew", "issues", "runs", "alerts", "daily", "rules", "status/site"],
    "the seven that can be read are read, in order, with the eighth left out");
  assert.equal(ops.state.failed.orders, "not-found", "and the one that could not is recorded");
  assert.ok(/try \{ this\.subscribe\(\); \} catch \(err\) \{ this\.fail\("subscriptions", err\); \}/.test(html),
    "init survives a subscribe that throws, so its second render still runs");
});

test("a half-typed owner note survives the next snapshot", async () => {
  const win = opsRoomWindow();
  const ops = win.OpsRoom;
  const key = "kit-manager:img-missing-dimensions-home";
  const notice = ops.h("p", {});

  const first = ops.noteBox(key, "saved earlier", notice);
  const area = first.querySelector("textarea")!;
  assert.equal((area as HTMLTextAreaElement).value, "saved earlier", "the saved note is what the box starts with");
  assert.ok(area.id, "the box has an id of its own");
  assert.equal(first.querySelector("label")!.getAttribute("for"), area.id, "and the label points at it");

  (area as HTMLTextAreaElement).value = "half a th";
  area.dispatchEvent(new win.Event("input"));
  assert.equal(ops.drafts[key], "half a th", "what is typed is kept while it is being typed");

  const again = ops.noteBox(key, "saved earlier", notice);
  assert.equal((again.querySelector("textarea") as HTMLTextAreaElement).value, "half a th",
    "and a rebuild on the next snapshot does not take it back");

  const writes: [string, Row][] = [];
  ops.db = { doc: (path: string) => ({ update: (patch: Row) => { writes.push([path, patch]); return Promise.resolve(); } }) };
  (again.querySelector("button") as HTMLButtonElement).click();
  await new Promise((done) => setTimeout(done, 0));
  assert.equal(writes.length, 1);
  assert.equal(writes[0][0], "issues/" + key);
  assert.equal(writes[0][1].ownerNote, "half a th");
  assert.equal(key in ops.drafts, false, "the draft is dropped once it has been saved");
});

test("every chart on Stats ends on the same day", () => {
  const ops = opsRoomWindow().OpsRoom;
  ops.state.daily = { "2026-09-24": { date: "2026-09-24", gameViews: 10 } };
  ops.state.runs = { r1: { date: "2026-09-27", issueKeys: [] } };
  assert.equal(ops.chartAnchor(), "2026-09-27", "the later of the newest reading and the newest run");
  const lines = ops.statsDays();
  const bars = ops.severityDays();
  assert.equal(lines.length, 14);
  assert.equal(bars.length, 14);
  assert.equal(lines[13].date, "2026-09-27");
  assert.equal(bars[13].date, "2026-09-27");
  assert.equal(ops.statsDays("2026-09-30")[13].date, "2026-09-30", "an anchor handed in is the one used");
  ops.state.daily = {};
  ops.state.runs = {};
  assert.match(ops.chartAnchor(), /^\d{4}-\d{2}-\d{2}$/, "and with neither, the viewer's own day");
  assert.ok(html.includes("const anchor = this.chartAnchor();"), "renderStats works one anchor out for all five charts");
});

test("an order is only called off while it is still queued", async () => {
  const ops = opsRoomWindow().OpsRoom;
  const writes: [string, Row][] = [];
  ops.db = { doc: (path: string) => ({ update: (patch: Row) => { writes.push([path, patch]); return Promise.resolve(); } }) };
  ops.state.orders = {
    running: { id: "running", status: "running" },
    queued: { id: "queued", status: "queued" },
  };
  await ops.cancelOrder("running");
  assert.equal(writes.length, 0, "a job the Groundsman has picked up is left alone");
  await ops.cancelOrder("gone");
  assert.equal(writes.length, 0, "and so is an order that is no longer on file");
  await ops.cancelOrder("queued");
  assert.equal(writes.length, 1);
  assert.equal(writes[0][0], "orders/queued");
  assert.equal(writes[0][1].status, "cancelled");
});

test("Ignored for now leaves out what has since been fixed", () => {
  const ops = opsRoomWindow().OpsRoom;
  const later = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
  const det = ops.snoozedList([
    { key: "a", title: "Still ignored", status: "acknowledged", snoozedUntil: later },
    { key: "b", title: "Fixed while ignored", status: "fixed", snoozedUntil: later },
  ]);
  const text = det.textContent ?? "";
  assert.ok(text.includes("Still ignored"));
  assert.ok(!text.includes("Fixed while ignored"), "a fixed issue is closed, not waiting to come back");
});

test("the hourly Groundsman is not listed among the overnight reports", () => {
  const ops = opsRoomWindow().OpsRoom;
  ops.state.crew = {
    physio: { id: "physio", name: "Physio", role: "checks the site", group: "backroom", kind: "reporter" },
    groundsman: { id: "groundsman", name: "Groundsman", role: "does the work", group: "backroom", kind: "actor" },
  };
  const overnight = ops.todayOvernight().textContent ?? "";
  assert.ok(overnight.includes("Physio"));
  assert.ok(!overnight.includes("Groundsman"), "an hourly actor never worked overnight");
  const through = ops.todayActors();
  assert.ok(through, "and has a line of his own");
  assert.ok((through!.textContent ?? "").includes("Groundsman"));
  ops.state.crew = { physio: { id: "physio", name: "Physio", kind: "reporter" } };
  assert.equal(ops.todayActors(), null, "which is not drawn when there is no actor");
});

test("the section list is a menu on a phone and the sidebar everywhere else", () => {
  assert.ok(!/display: grid !important/.test(html), "no stylesheet overrules the hidden attribute");
  assert.ok(/<div class="side-sheet" id="side-sheet">/.test(html), "the markup no longer claims it is hidden");
  assert.ok(/syncSheet\(\) \{[\s\S]{0,400}?sheet\.hidden = this\.narrow;/.test(html),
    "the width decides, in one place");
  assert.ok(/this\.syncSheet\(\);\n  \},/.test(html), "which runs once as the page binds");
  assert.ok(/\.side-sheet\[hidden\] \{ display: none; \}/.test(html), "and the phone rule still closes it");
});

test("a second nav to the section already shown does not rebuild it", () => {
  assert.ok(/const same = this\.active === to;/.test(html));
  assert.ok(/if \(!quiet && !same\) this\.render\(\);/.test(html),
    "the hashchange that follows nav cannot throw away the card showIssue focused");
});

test("the dead helpers are gone", () => {
  assert.ok(!/\bpct\(/.test(html), "pct was never called");
  assert.ok(!/plotW/.test(html), "and plotW was computed for nobody");
  assert.ok(!/cleanMarkdown/.test(html), "markdownBlock is the only name for the walk");
});

test("section links drive nav() themselves, because the artifact frame swallows a plain hash click", () => {
  const bind = html.slice(html.indexOf("bindNav()"), html.indexOf("syncSheet()"));
  assert.match(bind, /a\.addEventListener\("click", \(ev\) => \{\s*ev\.preventDefault\(\);\s*this\.nav\(a\.getAttribute\("data-section"\)\);/);
});

test("an issue with an order waiting shows the order instead of a second Fix button, and actions report success", () => {
  const actions = html.slice(html.indexOf("issueActions(key, status, notice) {"), html.indexOf("actionButton(label, notice, run, extra, done) {"));
  assert.match(actions, /const pending = this\.pendingOrderFor\(key\)/);
  assert.match(actions, /"Order given: " \+ this\.orderLabel\(pending\)/);
  assert.match(actions, /this\.actionButton\("Fix", notice, [^\n]*"btn-go", given\)/);
  assert.match(html, /const ORDER_GIVEN = "Order given\./);
  assert.match(html, /notice\.textContent = "Note saved\.";/);
  assert.match(html, /\.notice\.is-ok \{ color: var\(--ok\); \}/);
  const pend = html.slice(html.indexOf("pendingOrderFor(key) {"), html.indexOf("snoozedList(all) {"));
  assert.match(pend, /status === "queued" \|\| status === "running"/);
});
