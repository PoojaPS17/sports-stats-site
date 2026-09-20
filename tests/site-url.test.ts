import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveSiteUrl } from "../src/lib/site";
import { PRIMARY_HOST } from "../src/lib/launchHost";

const REVIEW_COPY = "https://sports-stats-site.vercel.app";

test("a launched site with no NEXT_PUBLIC_SITE_URL refuses to build", () => {
  assert.throws(() => resolveSiteUrl({ SITE_LAUNCHED: "1" }), /NEXT_PUBLIC_SITE_URL is not set/);
  assert.throws(() => resolveSiteUrl({ SITE_LAUNCHED: "1", NEXT_PUBLIC_SITE_URL: "" }), /NEXT_PUBLIC_SITE_URL is not set/);
});

test("a launched site pointed at the vercel.app review copy or any other host refuses to build", () => {
  assert.throws(() => resolveSiteUrl({ SITE_LAUNCHED: "1", NEXT_PUBLIC_SITE_URL: REVIEW_COPY }), /NEXT_PUBLIC_SITE_URL is "https:\/\/sports-stats-site\.vercel\.app"/);
  assert.throws(() => resolveSiteUrl({ SITE_LAUNCHED: "1", NEXT_PUBLIC_SITE_URL: `https://www.${PRIMARY_HOST}` }), /NEXT_PUBLIC_SITE_URL/);
  assert.throws(() => resolveSiteUrl({ SITE_LAUNCHED: "1", NEXT_PUBLIC_SITE_URL: `https://${PRIMARY_HOST}.evil.example` }), /NEXT_PUBLIC_SITE_URL/);
  assert.throws(() => resolveSiteUrl({ SITE_LAUNCHED: "1", NEXT_PUBLIC_SITE_URL: "not a url" }), /not a valid URL/);
});

test("a launched site at the launch host works, with or without a trailing slash", () => {
  assert.equal(resolveSiteUrl({ SITE_LAUNCHED: "1", NEXT_PUBLIC_SITE_URL: `https://${PRIMARY_HOST}` }), "https://sports-db.live");
  assert.equal(resolveSiteUrl({ SITE_LAUNCHED: "1", NEXT_PUBLIC_SITE_URL: `https://${PRIMARY_HOST}/` }), "https://sports-db.live");
});

test("before launch an unset URL falls back to the review copy, as it always has", () => {
  assert.equal(resolveSiteUrl({}), REVIEW_COPY);
  assert.equal(resolveSiteUrl({ SITE_LAUNCHED: "0" }), REVIEW_COPY);
});

test("before launch a set URL is used, trailing slash trimmed", () => {
  assert.equal(resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: "https://staging.example.com/" }), "https://staging.example.com");
  assert.equal(resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: `https://${PRIMARY_HOST}` }), "https://sports-db.live");
});

test("SITE_LAUNCHED must be exactly 1, as in the proxy", () => {
  assert.equal(resolveSiteUrl({ SITE_LAUNCHED: "true" }), REVIEW_COPY);
});

test("the proxy and site.ts share one launch-host constant", async () => {
  const { readFileSync } = await import("node:fs");
  const proxy = readFileSync(new URL("../src/proxy.ts", import.meta.url), "utf8");
  assert.match(proxy, /import \{ PRIMARY_HOST \} from "\.\/lib\/launchHost"/);
  assert.doesNotMatch(proxy, /const PRIMARY_HOST\s*=/);
});
