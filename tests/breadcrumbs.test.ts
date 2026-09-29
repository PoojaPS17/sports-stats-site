import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ContactPage from "../src/app/contact/page";
import PrivacyPage from "../src/app/privacy/page";
import TermsPage from "../src/app/terms/page";

// LegalPage renders the breadcrumb trail and its BreadcrumbList JSON-LD; a page that adds its own
// makes the block appear twice (audit 5.2).
test("each legal page emits exactly one BreadcrumbList", () => {
  for (const [name, Page] of [["contact", ContactPage], ["privacy", PrivacyPage], ["terms", TermsPage]] as const) {
    const html = renderToStaticMarkup(createElement(Page));
    assert.equal(html.match(/"@type":"BreadcrumbList"/g)?.length ?? 0, 1, `/${name}`);
  }
});

// The cricket match page drew its own "Cricket series › <series>" trail out of a bare <nav>, so 645
// match pages showed a trail to readers and none to Google. Breadcrumbs is the one component that
// renders the trail and emits the BreadcrumbList beside it, so a hand-rolled separator is the tell.
test("no page draws its own breadcrumb trail, which would leave it unmarked for Google", async () => {
  const { readdirSync, readFileSync } = await import("node:fs");
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(`${dir}/${e.name}`) : e.name === "page.tsx" ? [`${dir}/${e.name}`] : []
    );
  const handRolled = walk("src/app").filter((f) => readFileSync(f, "utf8").includes("›"));
  assert.deepEqual(handRolled, [], "these pages must use <Breadcrumbs /> instead");
});

// The trail readers see and the trail Google reads are allowed to differ by exactly this: a step
// with no page of its own stays on screen and leaves the JSON-LD, which cannot describe it.
test("a step with no page of its own stays in the visible trail but not in the JSON-LD", async () => {
  const { Breadcrumbs } = await import("../src/components/Breadcrumbs");
  const html = renderToStaticMarkup(
    createElement(Breadcrumbs, { items: [{ label: "NFL", href: "/nfl" }, { label: "Head-to-head" }, { label: "Cardinals vs Falcons" }] })
  );
  assert.match(html, /Head-to-head/, "readers still see the section they are in");
  const json = JSON.parse(html.match(/"@type":"BreadcrumbList".*?\}\]\}/)?.[0].replace(/^/, "{") ?? "{}");
  assert.deepEqual(json.itemListElement.map((i: { name: string }) => i.name), ["Home", "NFL", "Cardinals vs Falcons"]);
  for (const step of json.itemListElement.slice(0, -1)) assert.equal(typeof step.item, "string");
});
