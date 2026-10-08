import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CARD, CARD_DISPLAY_FONT } from "../src/lib/exportTheme";
import { ExportFooter } from "../src/components/ExportFooter";
import { SITE_URL } from "../src/lib/site";

// The light-theme tokens from globals.css, name → value, read from the first `:root {` block.
function lightTokens(): Record<string, string> {
  const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
  const start = css.indexOf(":root {");
  const block = css.slice(start, css.indexOf("}", start));
  const out: Record<string, string> = {};
  for (const m of block.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}

test("the card body mirrors the site's light tokens and the band is the fixed brand navy", () => {
  const t = lightTokens();
  assert.equal(CARD.bg, t.bg);
  assert.equal(CARD.surface, t.surface);
  // The page's --border now takes the --border-strong value (site-outline); export cards keep the original faint edge.
  assert.equal(CARD.border, "#dde8f2");
  assert.equal(CARD.text, t.text);
  assert.equal(CARD.textMuted, t["text-muted"]);
  assert.equal(CARD.textFaint, t["text-faint"]);
  assert.equal(CARD.accent, t["sig-ink"]);
  assert.equal(CARD.accentSoft, t["sig-soft"]);
  // The footer band is the fixed brand pair, not the theme's band, so a paper light theme
  // still ends every card on navy with the logo's own lit block (--logo-lit).
  assert.equal(CARD.sig, t["logo-lit"]);
  assert.equal(CARD.mast, t.navy);
  assert.equal(CARD.mastText, "#eef1f7");
  assert.equal(CARD.mastMuted, "#9aa5bd");
  assert.equal(CARD.win, t.win);
  assert.equal(CARD.loss, t.loss);
});

test("the display face is Plus Jakarta Sans through the page's font variable", () => {
  assert.match(CARD_DISPLAY_FONT, /^var\(--font-jakarta\), "Plus Jakarta Sans"/);
});

test("the footer is the navy band with the lit block, the wordmark and the domain", () => {
  const html = renderToStaticMarkup(createElement(ExportFooter, { context: "Test card" }));
  assert.match(html, /background:#0f2745/);
  assert.equal((html.match(/<rect /g) ?? []).length, 4);
  assert.match(html, /x="21" y="7" width="12" height="12" rx="3" fill="#c6f135"/);
  assert.match(html, /Sports<span style="color:#c6f135">DB<\/span>/);
  assert.ok(html.includes(SITE_URL.replace(/^https?:\/\//, "")));
  assert.ok(html.includes("Test card"));
  assert.ok(!html.includes("#1d4ed8"), "the old blue is gone");
});
