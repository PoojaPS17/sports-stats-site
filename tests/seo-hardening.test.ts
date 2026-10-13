import { test } from "node:test";
import assert from "node:assert/strict";
import nextConfig from "../next.config";
import { asianGamesWorthIndexing } from "../src/lib/asianGamesCricket";

test("/favicon.ico is sent to the generated icon with a permanent redirect, so it stops returning 404", async () => {
  const redirects = (await nextConfig.redirects?.()) ?? [];
  assert.deepEqual(redirects.find((r) => r.source === "/favicon.ico"), { source: "/favicon.ico", destination: "/icon", permanent: true });
});

test("every page carries the four hardening headers and no header that could break the site", async () => {
  const rules = (await nextConfig.headers?.()) ?? [];
  assert.equal(rules.length, 1);
  assert.equal(rules[0].source, "/:path*");
  const byKey = Object.fromEntries(rules[0].headers.map((h) => [h.key, h.value]));
  assert.deepEqual(byKey, {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "X-Frame-Options": "SAMEORIGIN",
  });
  // HSTS is Cloudflare's to set; a Content-Security-Policy here would have to name GA4, ESPN images and the fonts.
  assert.ok(!("Strict-Transport-Security" in byKey) && !("Content-Security-Policy" in byKey));
});

test("the Asian Games hub is indexable only while the Games are on or cricket from them is live or to come", () => {
  assert.equal(asianGamesWorthIndexing(true, 0), true);
  assert.equal(asianGamesWorthIndexing(false, 3), true);
  assert.equal(asianGamesWorthIndexing(false, 0), false);
});
