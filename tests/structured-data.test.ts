import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { organizationSchema } from "../src/lib/structuredData";
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
