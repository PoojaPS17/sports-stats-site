import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { breadcrumbSchema, organizationSchema, tennisPlayerSchema } from "../src/lib/structuredData";
import { SITE_URL } from "../src/lib/site";

// The Organization logo was /icon.png, which does not exist (Next serves the generated icon at a
// hashed address), so Google's logo fetch got a 404. A file under public/ is served at its own path.
test("the Organization logo is a real, square, sufficiently large PNG under public/", () => {
  const logo = organizationSchema().logo;
  assert.ok(logo.startsWith(`${SITE_URL}/`), `${logo} is on the site's own origin`);
  const file = new URL(`../public${logo.slice(SITE_URL.length)}`, import.meta.url);
  assert.ok(existsSync(file), `${logo} must exist as ${file.pathname}`);
  const png = readFileSync(file);
  assert.equal(png.subarray(1, 4).toString(), "PNG");
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  assert.equal(width, height, "Google wants a square logo");
  assert.ok(width >= 112, `logo is ${width}px; Google's minimum is 112px`);
});

test("a tennis player is a Person at their own page, with an image only when they have one", () => {
  const withImage = tennisPlayerSchema("atp", { name: "Hugo Grenier", slug: "hugo-grenier", headshot_url: "https://a.espncdn.com/h.png" });
  assert.equal(withImage["@type"], "Person");
  assert.equal(withImage.url, `${SITE_URL}/tennis/atp/players/hugo-grenier`);
  assert.equal(withImage.image, "https://a.espncdn.com/h.png");
  const bare = tennisPlayerSchema("wta", { name: "A B", slug: "a-b", headshot_url: null });
  assert.equal("image" in bare, false);
  assert.equal("nationality" in bare, false, "a country code is not a name, so none is claimed");
});

test("a breadcrumb trail starts at Home and links every step but the last", () => {
  const list = breadcrumbSchema([{ label: "Tennis", href: "/tennis" }, { label: "ATP", href: "/tennis/atp" }, { label: "Hugo Grenier" }]).itemListElement;
  assert.deepEqual(list.map((i) => i.name), ["Home", "Tennis", "ATP", "Hugo Grenier"]);
  assert.deepEqual(list.map((i) => i.position), [1, 2, 3, 4]);
  assert.equal(list[0].item, `${SITE_URL}/`);
  assert.equal(list[3].item, undefined);
  assert.deepEqual(breadcrumbSchema([{ label: "Cricket series" }]).itemListElement.map((i) => i.name), ["Home", "Cricket series"]);
});
