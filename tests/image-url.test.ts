import { test } from "node:test";
import assert from "node:assert/strict";
import { usableImageUrl } from "../src/lib/imageUrl";

test("real image URLs pass through untouched", () => {
  for (const u of [
    "https://a.espncdn.com/i/headshots/cricket/players/full/253802.png",
    "https://a.espncdn.com/i/teamlogos/countries/500/ind.png",
    "http://example.com/a/b.jpg?x=1",
    "/api/img/1.png",
  ]) assert.equal(usableImageUrl(u), u);
});

test("blank and non-image values are dropped", () => {
  for (const u of [null, undefined, "", "   ", "null", "undefined", "N/A", "not a url", "javascript:alert(1)", "data:image/png;base64,AA", "https://a.espncdn.com", "https://a.espncdn.com/"])
    assert.equal(usableImageUrl(u as string | null | undefined), null, String(u));
});

test("placeholder art is dropped, lookalike players are not", () => {
  assert.equal(usableImageUrl("https://a.espncdn.com/combiner/i?img=/i/headshots/nophoto.png"), null);
  assert.equal(usableImageUrl("https://a.espncdn.com/i/headshots/nophoto.png"), null);
  assert.equal(usableImageUrl("https://x.com/i/default-image.png"), null);
  assert.equal(usableImageUrl("https://x.com/i/placeholder.png"), null);
  assert.ok(usableImageUrl("https://x.com/i/headshots/defaulter-smith.png"));
});

test("protocol-relative URLs become https", () => {
  assert.equal(usableImageUrl("//a.espncdn.com/i/x.png"), "https://a.espncdn.com/i/x.png");
});
