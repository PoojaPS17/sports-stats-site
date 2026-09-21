import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import robots from "../src/app/robots";
import { feedResponse } from "../src/lib/ics";

const rule = () => {
  const rules = robots().rules;
  const one = Array.isArray(rules) ? rules[0] : rules;
  return one as { userAgent: string; allow: string; disallow: string[] };
};

test("only the internal JSON endpoints are disallowed", () => {
  assert.deepEqual(rule().disallow, ["/api/"]);
});

// A robots-blocked URL that is linked sitewide can be indexed URL-only, and Google never sees its
// noindex. So /search (noindex meta) and /calendar (X-Robots-Tag) must stay crawlable.
test("/search and /calendar are crawlable so their noindex is seen", () => {
  const { disallow } = rule();
  assert.ok(!disallow.some((d) => "/search".startsWith(d) || "/calendar/epl".startsWith(d)));
});

// Both calendar routes (league and team feeds) answer through feedResponse.
test("calendar feeds send X-Robots-Tag: noindex", () => {
  for (const download of [false, true]) {
    const res = feedResponse({ filename: "epl.ics", ics: "BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n" }, download);
    assert.equal(res.headers.get("x-robots-tag"), "noindex");
    assert.match(res.headers.get("content-type") ?? "", /^text\/calendar/);
    assert.equal(res.headers.get("content-disposition"), `${download ? "attachment" : "inline"}; filename="epl.ics"`);
    assert.equal(res.headers.get("cache-control"), "public, s-maxage=1800, stale-while-revalidate=3600");
  }
});

test("both calendar routes answer through feedResponse", () => {
  for (const file of ["src/app/calendar/[league]/route.ts", "src/app/calendar/[league]/[slug]/route.ts"]) {
    assert.match(readFileSync(file, "utf8"), /feedResponse\(/, file);
  }
});
