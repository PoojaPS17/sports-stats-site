import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import proxy from "../src/proxy";

// The proxy reads the Host header (Cloudflare passes the public host through to the VM).
function req(host: string, path = "/", scheme = "https"): NextRequest {
  return new NextRequest(`${scheme}://${host}${path}`, { headers: { host } });
}

const NOINDEX = "noindex, nofollow";
const ROBOTS_BODY = "User-agent: *\nDisallow: /\n";

let savedLaunched: string | undefined;
beforeEach(() => {
  savedLaunched = process.env.SITE_LAUNCHED;
  delete process.env.SITE_LAUNCHED;
});
afterEach(() => {
  if (savedLaunched === undefined) delete process.env.SITE_LAUNCHED;
  else process.env.SITE_LAUNCHED = savedLaunched;
});

// A NextResponse.next() carries this header; a rewrite carries x-middleware-rewrite.
const isPassThrough = (r: Response) => r.headers.get("x-middleware-next") === "1";
const isRewriteTo = (r: Response, path: string) => new URL(r.headers.get("x-middleware-rewrite") ?? "http://none").pathname === path;

describe("non-primary hosts (review copy, aliases) are never indexable", () => {
  for (const launched of [false, true]) {
    describe(launched ? "after launch" : "before launch", () => {
      beforeEach(() => {
        if (launched) process.env.SITE_LAUNCHED = "1";
      });

      test("the vercel.app copy serves the page with noindex, nofollow", () => {
        const res = proxy(req("sports-stats-site.vercel.app", "/nba/players/lebron-james"));
        assert.ok(isPassThrough(res), "the review copy must still serve normally");
        assert.equal(res.headers.get("x-robots-tag"), NOINDEX);
      });

      test("the vercel.app copy's robots.txt disallows everything and is not cached", async () => {
        const res = proxy(req("sports-stats-site.vercel.app", "/robots.txt"));
        assert.equal(await res.text(), ROBOTS_BODY);
        assert.equal(res.headers.get("x-robots-tag"), NOINDEX);
        assert.equal(res.headers.get("cache-control"), "no-store");
        assert.match(res.headers.get("content-type") ?? "", /^text\/plain/);
      });

      test("a host with a port and mixed case is still non-primary", () => {
        const res = proxy(req("Sports-Stats-Site.Vercel.App:443", "/nba"));
        assert.equal(res.headers.get("x-robots-tag"), NOINDEX);
      });

      test("a missing host header fails safe to noindex", () => {
        const res = proxy(new NextRequest("https://example.com/nba"));
        assert.equal(res.headers.get("x-robots-tag"), NOINDEX);
      });
    });
  }

  test("a sports-db.live subdomain other than www is not indexable after launch", async () => {
    process.env.SITE_LAUNCHED = "1";
    const res = proxy(req("staging.sports-db.live", "/nba"));
    assert.ok(isPassThrough(res));
    assert.equal(res.headers.get("x-robots-tag"), NOINDEX);
    const robots = proxy(req("staging.sports-db.live", "/robots.txt"));
    assert.equal(await robots.text(), ROBOTS_BODY);
  });
});

describe("development hosts are left alone", () => {
  for (const host of ["localhost:3000", "127.0.0.1:3000", "app.localhost:3000", "[::1]:3000"]) {
    test(`${host} gets no noindex and no robots override`, () => {
      const page = proxy(req(host, "/nba", "http"));
      assert.ok(isPassThrough(page));
      assert.equal(page.headers.get("x-robots-tag"), null);
      const robots = proxy(req(host, "/robots.txt", "http"));
      assert.ok(isPassThrough(robots), "robots.txt falls through to src/app/robots.ts");
      assert.equal(robots.headers.get("x-robots-tag"), null);
    });
  }

  test("a lookalike is not a dev host", () => {
    assert.equal(proxy(req("evil-localhost.example", "/nba")).headers.get("x-robots-tag"), NOINDEX);
    assert.equal(proxy(req("localhost.evil.example", "/nba")).headers.get("x-robots-tag"), NOINDEX);
  });
});

describe("sports-db.live after launch", () => {
  beforeEach(() => {
    process.env.SITE_LAUNCHED = "1";
  });

  test("serves normally and adds no headers", () => {
    const res = proxy(req("sports-db.live", "/nba"));
    assert.ok(isPassThrough(res));
    assert.equal(res.headers.get("x-robots-tag"), null);
    assert.equal(res.headers.get("cache-control"), null);
  });

  test("robots.txt falls through to src/app/robots.ts", () => {
    const res = proxy(req("sports-db.live", "/robots.txt"));
    assert.ok(isPassThrough(res));
    assert.equal(res.headers.get("x-robots-tag"), null);
  });
});

describe("sports-db.live before launch", () => {
  test("rewrites every page to the holding page, noindex and uncached", () => {
    const res = proxy(req("sports-db.live", "/nba/players/lebron-james?x=1"));
    assert.ok(isRewriteTo(res, "/coming-soon"));
    assert.equal(res.headers.get("x-robots-tag"), NOINDEX);
    assert.equal(res.headers.get("cache-control"), "no-store");
  });

  test("robots.txt disallows everything and is not cached by Cloudflare", async () => {
    const res = proxy(req("sports-db.live", "/robots.txt"));
    assert.equal(await res.text(), ROBOTS_BODY);
    assert.equal(res.headers.get("x-robots-tag"), NOINDEX);
    assert.equal(res.headers.get("cache-control"), "no-store");
    assert.match(res.headers.get("content-type") ?? "", /^text\/plain/);
  });
});

describe("www.sports-db.live redirects to the apex", () => {
  for (const launched of [false, true]) {
    describe(launched ? "after launch" : "before launch", () => {
      beforeEach(() => {
        if (launched) process.env.SITE_LAUNCHED = "1";
      });

      test("308 to https://sports-db.live keeping the path and query", () => {
        const res = proxy(req("www.sports-db.live", "/nba/players/lebron-james?season=2025&a=b"));
        assert.equal(res.status, 308);
        assert.equal(res.headers.get("location"), "https://sports-db.live/nba/players/lebron-james?season=2025&a=b");
      });

      test("the bare root and robots.txt redirect too", () => {
        assert.equal(proxy(req("www.sports-db.live", "/")).headers.get("location"), "https://sports-db.live/");
        const robots = proxy(req("www.sports-db.live", "/robots.txt"));
        assert.equal(robots.status, 308);
        assert.equal(robots.headers.get("location"), "https://sports-db.live/robots.txt");
      });

      test("the host match ignores case and a port", () => {
        const res = proxy(req("WWW.Sports-DB.live:443", "/nba"));
        assert.equal(res.status, 308);
        assert.equal(res.headers.get("location"), "https://sports-db.live/nba");
      });

      test("a protocol-relative path cannot turn the redirect into an open redirect", () => {
        const res = proxy(req("www.sports-db.live", "//evil.example/x?y=1"));
        assert.equal(res.status, 308);
        assert.equal(new URL(res.headers.get("location") ?? "").host, "sports-db.live");
      });
    });
  }
});
