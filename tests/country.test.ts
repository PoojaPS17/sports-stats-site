import { test } from "node:test";
import assert from "node:assert/strict";
import { visitorCountry } from "../src/lib/country";
import { GET } from "../src/app/api/region/route";

function hdrs(values: Record<string, string>): Headers {
  return new Headers(values);
}

test("visitorCountry reads the Cloudflare header", () => {
  assert.equal(visitorCountry(hdrs({ "cf-ipcountry": "FR" })), "FR");
});

test("visitorCountry reads the Vercel header", () => {
  assert.equal(visitorCountry(hdrs({ "x-vercel-ip-country": "GB" })), "GB");
});

test("visitorCountry prefers Cloudflare when both headers are present", () => {
  assert.equal(visitorCountry(hdrs({ "cf-ipcountry": "DE", "x-vercel-ip-country": "US" })), "DE");
});

test("visitorCountry upper-cases and trims", () => {
  assert.equal(visitorCountry(hdrs({ "cf-ipcountry": "fr" })), "FR");
  assert.equal(visitorCountry(hdrs({ "cf-ipcountry": "  de  " })), "DE");
});

test("visitorCountry treats XX as unknown and falls through to the Vercel header", () => {
  assert.equal(visitorCountry(hdrs({ "cf-ipcountry": "XX", "x-vercel-ip-country": "US" })), "US");
  assert.equal(visitorCountry(hdrs({ "cf-ipcountry": "XX" })), null);
  assert.equal(visitorCountry(hdrs({ "cf-ipcountry": "xx" })), null);
});

test("visitorCountry ignores Tor (T1) and other malformed values", () => {
  assert.equal(visitorCountry(hdrs({ "cf-ipcountry": "T1" })), null);
  for (const bad of ["", "   ", "USA", "1A", "U", "U1", "é1", "ÉÉ"]) {
    assert.equal(visitorCountry(hdrs({ "cf-ipcountry": bad })), null, JSON.stringify(bad));
  }
});

test("visitorCountry falls through a malformed Cloudflare value to a valid Vercel one", () => {
  assert.equal(visitorCountry(hdrs({ "cf-ipcountry": "T1", "x-vercel-ip-country": "us" })), "US");
});

test("visitorCountry is null with no headers", () => {
  assert.equal(visitorCountry(hdrs({})), null);
});

async function consentRequired(values: Record<string, string>): Promise<boolean> {
  const res = GET(new Request("http://localhost/api/region", { headers: values }));
  assert.equal(res.headers.get("cache-control"), "private, no-store");
  const body = (await res.json()) as { consentRequired: boolean };
  return body.consentRequired;
}

test("region: France via Cloudflare requires consent", async () => {
  assert.equal(await consentRequired({ "cf-ipcountry": "FR" }), true);
});

test("region: United States via Cloudflare does not require consent", async () => {
  assert.equal(await consentRequired({ "cf-ipcountry": "US" }), false);
});

test("region: United Kingdom via the Vercel header requires consent", async () => {
  assert.equal(await consentRequired({ "x-vercel-ip-country": "GB" }), true);
});

test("region: unknown country is the cautious answer (consent required)", async () => {
  assert.equal(await consentRequired({}), true);
  assert.equal(await consentRequired({ "cf-ipcountry": "XX" }), true);
  assert.equal(await consentRequired({ "cf-ipcountry": "T1" }), true);
});
