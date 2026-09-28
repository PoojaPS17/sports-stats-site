// Regression coverage for the ESPN cricket team-logo 404 problem: a stale or guessed
// ESPN team-logo URL that 404s isn't just a broken <img> in the browser — fed into
// the opengraph-image routes' @vercel/og rendering, a 404 (HTML body, not image bytes)
// throws "Unsupported image type: unknown" and spams the server log on every request.
// resolveTeamLogo is the single place that must catch a known-bad id before any of
// that happens, regardless of what the caller passed as the observed logo URL.
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveTeamLogo } from "../src/lib/teamLogos";

test("resolveTeamLogo overrides a known-bad id even when a (dead) URL is supplied", () => {
  // 299047 has no ESPN logo art at all; a caller passing a guessed dead URL for it
  // (as the cricket import script and live-match page both used to) must not win.
  const guessed = "https://a.espncdn.com/i/teamlogos/cricket/500/299047.png";
  assert.equal(resolveTeamLogo("299047", guessed), "https://a.espncdn.com/i/teamlogos/cricket/500/23.png");
});

test("resolveTeamLogo blanks a confirmed-missing id regardless of the supplied logo", () => {
  assert.equal(resolveTeamLogo("1399051", "https://a.espncdn.com/i/teamlogos/cricket/500/1399051.png"), null);
});

test("resolveTeamLogo blanks the two ids most recently confirmed 404 (145, 1459373)", () => {
  assert.equal(resolveTeamLogo(145, "https://a.espncdn.com/i/teamlogos/cricket/500/145.png"), null);
  assert.equal(resolveTeamLogo("1459373", "https://a.espncdn.com/i/teamlogos/cricket/500/1459373.png"), null);
});

test("resolveTeamLogo passes an unknown id's logo through unchanged", () => {
  assert.equal(resolveTeamLogo("6", "https://a.espncdn.com/i/teamlogos/cricket/500/6.png"), "https://a.espncdn.com/i/teamlogos/cricket/500/6.png");
  assert.equal(resolveTeamLogo("6", null), null);
});

test("resolveTeamLogo handles a missing id", () => {
  assert.equal(resolveTeamLogo(null, "https://a.espncdn.com/i/teamlogos/cricket/500/6.png"), "https://a.espncdn.com/i/teamlogos/cricket/500/6.png");
  assert.equal(resolveTeamLogo(undefined, null), null);
});
