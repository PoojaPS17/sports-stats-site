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
